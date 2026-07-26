import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import {
  CoworkingPairedRuntimeHistoricalSessionPageResponseSchema,
  CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema,
  CoworkingPairedRuntimeListLiveSessionsParamsSchema,
  CoworkingPairedRuntimeLiveSessionsResponseSchema,
  CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema
} from '../../../shared/coworking/paired-runtime-session-contract'
import { COWORKING_SESSION_PAGE_REQUEST_TIMEOUT_MS } from '../../../shared/coworking/resource-limits'
import { callRuntimeEnvironmentExistingRoute } from '../../runtime/environment-existing-route'
import { CoworkingExecutionError } from '../execution-error'
import type {
  CoworkingExecutionHostSessionReader,
  CoworkingExecutionHostSessionReadRequest,
  CoworkingMobileSessionTabsResult,
  CoworkingObservedProviderSession
} from '../session/source'
import {
  pairedRuntimeSessionTarget,
  CoworkingPairedRuntimeSessionChangeSubscriptions
} from './session-change-subscriptions'
import {
  projectPairedRuntimeHistoricalSession,
  projectPairedRuntimeLiveTab
} from './session-projection'

const DEFAULT_TIMEOUT_MS = 15_000

export type YiruCoworkingPairedRuntimeSessionReaderOptions = {
  userDataPath: string
  timeoutMs?: number
}

/** Reads a strict projection while locator material remains on the paired owner channel. */
export class YiruCoworkingPairedRuntimeSessionReader implements CoworkingExecutionHostSessionReader {
  private readonly sessionChanges: CoworkingPairedRuntimeSessionChangeSubscriptions

  constructor(private readonly options: YiruCoworkingPairedRuntimeSessionReaderOptions) {
    this.sessionChanges = new CoworkingPairedRuntimeSessionChangeSubscriptions(
      options.userDataPath,
      async (request) => await this.listMobileSessionTabs(request)
    )
  }

  registerPublicWorktree(request: CoworkingExecutionHostSessionReadRequest): void {
    this.sessionChanges.ensure(requireRuntimeEnvironment(request), request)
  }

  unregisterPublicWorktree(request: CoworkingExecutionHostSessionReadRequest): void {
    this.sessionChanges.forget(requireRuntimeEnvironment(request), request)
  }

  async listMobileSessionTabs(
    request: CoworkingExecutionHostSessionReadRequest,
    signal?: AbortSignal
  ) {
    const environmentId = requireRuntimeEnvironment(request)
    const params = CoworkingPairedRuntimeListLiveSessionsParamsSchema.parse({
      target: pairedRuntimeSessionTarget(request)
    })
    const response = await this.call(
      environmentId,
      'coworking.host.listLiveSessions',
      params,
      signal
    )
    if (!response.ok) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const envelope = CoworkingPairedRuntimeLiveSessionsResponseSchema.safeParse(response.result)
    if (!envelope.success) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    if (envelope.data.status === 'error') {
      throw new CoworkingExecutionError(envelope.data.code)
    }
    this.sessionChanges.ensure(environmentId, request)
    const tabs = envelope.data.result.sessions.map((session) =>
      projectPairedRuntimeLiveTab(session, request.worktreeInstanceId)
    )
    const activeTab = tabs.find((tab) => tab.isActive)
    return {
      worktree: request.worktreeId,
      publicationEpoch: request.coworkingIncarnationId,
      snapshotVersion: 0,
      activeGroupId: null,
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab ? ('terminal' as const) : null,
      tabs
    }
  }

  async listAiVaultSessionPage(
    request: CoworkingExecutionHostSessionReadRequest,
    cursor: string | null,
    signal?: AbortSignal
  ) {
    const environmentId = requireRuntimeEnvironment(request)
    const params = CoworkingPairedRuntimeListHistoricalSessionPageParamsSchema.parse({
      target: pairedRuntimeSessionTarget(request),
      purpose: request.purpose,
      inventoryScope: request.inventoryScope,
      cursor
    })
    const response = await this.call(
      environmentId,
      'coworking.host.listHistoricalSessionPage',
      params,
      signal,
      this.options.timeoutMs ?? COWORKING_SESSION_PAGE_REQUEST_TIMEOUT_MS
    )
    if (!response.ok) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const envelope = CoworkingPairedRuntimeHistoricalSessionPageResponseSchema.safeParse(
      response.result
    )
    if (!envelope.success) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    if (envelope.data.status === 'error') {
      throw new CoworkingExecutionError(envelope.data.code)
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
    request: CoworkingExecutionHostSessionReadRequest,
    cursor: string | null
  ): Promise<void> {
    const environmentId = requireRuntimeEnvironment(request)
    const params = CoworkingPairedRuntimeReleaseHistoricalSessionPageParamsSchema.parse({
      target: pairedRuntimeSessionTarget(request),
      purpose: request.purpose,
      inventoryScope: request.inventoryScope,
      cursor
    })
    const response = await this.call(
      environmentId,
      'coworking.host.releaseHistoricalSessionPage',
      params
    )
    if (
      !response.ok ||
      !response.result ||
      typeof response.result !== 'object' ||
      (response.result as { ok?: unknown }).ok !== true
    ) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
  }

  subscribe(
    listener: (
      snapshot?: CoworkingMobileSessionTabsResult,
      request?: CoworkingExecutionHostSessionReadRequest,
      providerSessions?: readonly CoworkingObservedProviderSession[]
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
      if (error instanceof CoworkingExecutionError) {
        throw error
      }
      throw new CoworkingExecutionError('resource_unavailable')
    }
  }
}

function requireRuntimeEnvironment(request: CoworkingExecutionHostSessionReadRequest): string {
  const host = parseExecutionHostId(request.executionHostId)
  if (!host || host.kind !== 'runtime') {
    throw new CoworkingExecutionError('resource_unavailable')
  }
  return host.environmentId
}
