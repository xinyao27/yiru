import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import {
  SpoolPairedRuntimeHistoricalSessionPageResponseSchema,
  SpoolPairedRuntimeListHistoricalSessionPageParamsSchema,
  SpoolPairedRuntimeListLiveSessionsParamsSchema,
  SpoolPairedRuntimeLiveSessionsResponseSchema,
  SpoolPairedRuntimeReleaseHistoricalSessionPageParamsSchema
} from '../../shared/spool/spool-paired-runtime-session-contract'
import { SPOOL_SESSION_PAGE_REQUEST_TIMEOUT_MS } from '../../shared/spool/spool-resource-limits'
import { callRuntimeEnvironmentExistingRoute } from '../ipc/runtime-environment-existing-route'
import { SpoolExecutionError } from './spool-execution-error'
import {
  pairedRuntimeSessionTarget,
  SpoolPairedRuntimeSessionChangeSubscriptions
} from './spool-paired-runtime-session-change-subscriptions'
import {
  projectPairedRuntimeHistoricalSession,
  projectPairedRuntimeLiveTab
} from './spool-paired-runtime-session-projection'
import type {
  SpoolExecutionHostSessionReader,
  SpoolExecutionHostSessionReadRequest,
  SpoolMobileSessionTabsResult,
  SpoolObservedProviderSession
} from './spool-session-source'

const DEFAULT_TIMEOUT_MS = 15_000

export type YiruSpoolPairedRuntimeSessionReaderOptions = {
  userDataPath: string
  timeoutMs?: number
}

/** Reads a strict projection while locator material remains on the paired owner channel. */
export class YiruSpoolPairedRuntimeSessionReader implements SpoolExecutionHostSessionReader {
  private readonly sessionChanges: SpoolPairedRuntimeSessionChangeSubscriptions

  constructor(private readonly options: YiruSpoolPairedRuntimeSessionReaderOptions) {
    this.sessionChanges = new SpoolPairedRuntimeSessionChangeSubscriptions(
      options.userDataPath,
      async (request) => await this.listMobileSessionTabs(request)
    )
  }

  registerPublicWorktree(request: SpoolExecutionHostSessionReadRequest): void {
    this.sessionChanges.ensure(requireRuntimeEnvironment(request), request)
  }

  unregisterPublicWorktree(request: SpoolExecutionHostSessionReadRequest): void {
    this.sessionChanges.forget(requireRuntimeEnvironment(request), request)
  }

  async listMobileSessionTabs(request: SpoolExecutionHostSessionReadRequest, signal?: AbortSignal) {
    const environmentId = requireRuntimeEnvironment(request)
    const params = SpoolPairedRuntimeListLiveSessionsParamsSchema.parse({
      target: pairedRuntimeSessionTarget(request)
    })
    const response = await this.call(environmentId, 'spool.host.listLiveSessions', params, signal)
    if (!response.ok) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    const envelope = SpoolPairedRuntimeLiveSessionsResponseSchema.safeParse(response.result)
    if (!envelope.success) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (envelope.data.status === 'error') {
      throw new SpoolExecutionError(envelope.data.code)
    }
    this.sessionChanges.ensure(environmentId, request)
    const tabs = envelope.data.result.sessions.map((session) =>
      projectPairedRuntimeLiveTab(session, request.worktreeInstanceId)
    )
    const activeTab = tabs.find((tab) => tab.isActive)
    return {
      worktree: request.worktreeId,
      publicationEpoch: request.spoolIncarnationId,
      snapshotVersion: 0,
      activeGroupId: null,
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab ? ('terminal' as const) : null,
      tabs
    }
  }

  async listAiVaultSessionPage(
    request: SpoolExecutionHostSessionReadRequest,
    cursor: string | null,
    signal?: AbortSignal
  ) {
    const environmentId = requireRuntimeEnvironment(request)
    const params = SpoolPairedRuntimeListHistoricalSessionPageParamsSchema.parse({
      target: pairedRuntimeSessionTarget(request),
      purpose: request.purpose,
      inventoryScope: request.inventoryScope,
      cursor
    })
    const response = await this.call(
      environmentId,
      'spool.host.listHistoricalSessionPage',
      params,
      signal,
      this.options.timeoutMs ?? SPOOL_SESSION_PAGE_REQUEST_TIMEOUT_MS
    )
    if (!response.ok) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    const envelope = SpoolPairedRuntimeHistoricalSessionPageResponseSchema.safeParse(
      response.result
    )
    if (!envelope.success) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    if (envelope.data.status === 'error') {
      throw new SpoolExecutionError(envelope.data.code)
    }
    this.sessionChanges.ensure(environmentId, request)
    const result = envelope.data.result
    return {
      sessions: result.sessions.map((session) =>
        projectPairedRuntimeHistoricalSession(request, result.scannedAt, session)
      ),
      nextCursor: result.nextCursor,
      scannedAt: result.scannedAt
    }
  }

  async releaseAiVaultSessionPage(
    request: SpoolExecutionHostSessionReadRequest,
    cursor: string | null
  ): Promise<void> {
    const environmentId = requireRuntimeEnvironment(request)
    const params = SpoolPairedRuntimeReleaseHistoricalSessionPageParamsSchema.parse({
      target: pairedRuntimeSessionTarget(request),
      purpose: request.purpose,
      inventoryScope: request.inventoryScope,
      cursor
    })
    const response = await this.call(
      environmentId,
      'spool.host.releaseHistoricalSessionPage',
      params
    )
    if (
      !response.ok ||
      !response.result ||
      typeof response.result !== 'object' ||
      (response.result as { ok?: unknown }).ok !== true
    ) {
      throw new SpoolExecutionError('resource_unavailable')
    }
  }

  subscribe(
    listener: (
      snapshot?: SpoolMobileSessionTabsResult,
      request?: SpoolExecutionHostSessionReadRequest,
      providerSessions?: readonly SpoolObservedProviderSession[]
    ) => void
  ): () => void {
    return this.sessionChanges.subscribe(listener)
  }

  private async call(
    environmentId: string,
    method: string,
    params: unknown,
    signal?: AbortSignal,
    timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  ) {
    try {
      return await callRuntimeEnvironmentExistingRoute(
        this.options.userDataPath,
        environmentId,
        method,
        params,
        timeoutMs,
        { signal }
      )
    } catch (error) {
      if (error instanceof SpoolExecutionError) {
        throw error
      }
      throw new SpoolExecutionError('resource_unavailable')
    }
  }
}

function requireRuntimeEnvironment(request: SpoolExecutionHostSessionReadRequest): string {
  const host = parseExecutionHostId(request.executionHostId)
  if (!host || host.kind !== 'runtime') {
    throw new SpoolExecutionError('resource_unavailable')
  }
  return host.environmentId
}
