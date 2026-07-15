import { parseExecutionHostId } from '../../shared/execution-host'
import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import {
  SpoolPairedRuntimeHistoricalSessionPageResponseSchema,
  SpoolPairedRuntimeListHistoricalSessionPageParamsSchema,
  SpoolPairedRuntimeListLiveSessionsParamsSchema,
  SpoolPairedRuntimeLiveSessionsResponseSchema,
  SpoolPairedRuntimeReleaseHistoricalSessionPageParamsSchema,
  SpoolPairedRuntimeSessionChangedEventSchema,
  SpoolPairedRuntimeSubscribeSessionChangesParamsSchema
} from '../../shared/spool/spool-paired-runtime-session-contract'
import { SPOOL_SESSION_PAGE_REQUEST_TIMEOUT_MS } from '../../shared/spool/spool-resource-limits'
import {
  callRuntimeEnvironmentExistingRoute,
  subscribeRuntimeEnvironmentExistingRoute
} from '../ipc/runtime-environment-existing-route'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolExecutionHostSessionReader,
  SpoolExecutionHostSessionReadRequest
} from './spool-session-source'
import {
  projectPairedRuntimeHistoricalSession,
  projectPairedRuntimeLiveTab
} from './spool-paired-runtime-session-projection'

const DEFAULT_TIMEOUT_MS = 15_000

export type OrcaSpoolPairedRuntimeSessionReaderOptions = {
  userDataPath: string
  timeoutMs?: number
}

type SessionChangesBinding = {
  targetIdentity: string
  subscription: RemoteRuntimeSubscription | null
}

/** Reads a strict projection while locator material remains on the paired owner channel. */
export class OrcaSpoolPairedRuntimeSessionReader implements SpoolExecutionHostSessionReader {
  private readonly listeners = new Set<() => void>()
  private readonly sessionChangesBindings = new Map<string, SessionChangesBinding>()

  constructor(private readonly options: OrcaSpoolPairedRuntimeSessionReaderOptions) {}

  async listMobileSessionTabs(request: SpoolExecutionHostSessionReadRequest, signal?: AbortSignal) {
    const environmentId = requireRuntimeEnvironment(request)
    const params = SpoolPairedRuntimeListLiveSessionsParamsSchema.parse({
      target: sessionTarget(request)
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
    this.ensureSessionChangesSubscription(environmentId, request)
    const tabs = envelope.data.result.sessions.map((session) =>
      projectPairedRuntimeLiveTab(session, request.worktreeInstanceId)
    )
    return {
      worktree: request.worktreeId,
      publicationEpoch: request.spoolIncarnationId,
      snapshotVersion: 0,
      activeGroupId: null,
      activeTabId: null,
      activeTabType: null,
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
      target: sessionTarget(request),
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
    this.ensureSessionChangesSubscription(environmentId, request)
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
      target: sessionTarget(request),
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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) {
        return
      }
      subscribed = false
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.closeSessionChangesBindings()
      }
    }
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

  private ensureSessionChangesSubscription(
    environmentId: string,
    request: SpoolExecutionHostSessionReadRequest
  ): void {
    if (this.listeners.size === 0) {
      return
    }
    const bindingKey = sessionChangesBindingKey(environmentId, request.worktreeId)
    const targetIdentity = sessionTargetIdentity(request)
    const existing = this.sessionChangesBindings.get(bindingKey)
    if (existing?.targetIdentity === targetIdentity) {
      return
    }
    if (existing) {
      this.closeSessionChangesBinding(bindingKey, existing)
    }
    const params = SpoolPairedRuntimeSubscribeSessionChangesParamsSchema.parse({
      target: sessionTarget(request)
    })
    const binding: SessionChangesBinding = { targetIdentity, subscription: null }
    this.sessionChangesBindings.set(bindingKey, binding)
    void subscribeRuntimeEnvironmentExistingRoute(
      this.options.userDataPath,
      environmentId,
      'spool.host.subscribeSessionChanges',
      params,
      {
        onEvent: (event) => this.handleSessionChangesEvent(bindingKey, binding, event),
        onClose: () => this.closeSessionChangesBinding(bindingKey, binding)
      }
    )
      .then((subscription) => {
        if (this.sessionChangesBindings.get(bindingKey) !== binding) {
          subscription.close()
          return
        }
        binding.subscription = subscription
      })
      .catch(() => this.closeSessionChangesBinding(bindingKey, binding))
  }

  private handleSessionChangesEvent(
    bindingKey: string,
    binding: SessionChangesBinding,
    event: Parameters<Parameters<typeof subscribeRuntimeEnvironmentExistingRoute>[4]['onEvent']>[0]
  ): void {
    if (this.sessionChangesBindings.get(bindingKey) !== binding) {
      return
    }
    if (event.type !== 'response' || !event.response.ok) {
      this.closeSessionChangesBinding(bindingKey, binding)
      return
    }
    const changed = SpoolPairedRuntimeSessionChangedEventSchema.safeParse(event.response.result)
    if (!changed.success) {
      this.closeSessionChangesBinding(bindingKey, binding)
      return
    }
    const listeners = Array.from(this.listeners)
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // One catalog observer must not prevent the others from refreshing.
      }
    }
  }

  private closeSessionChangesBinding(bindingKey: string, binding: SessionChangesBinding): void {
    if (this.sessionChangesBindings.get(bindingKey) !== binding) {
      return
    }
    this.sessionChangesBindings.delete(bindingKey)
    binding.subscription?.close()
    binding.subscription = null
  }

  private closeSessionChangesBindings(): void {
    for (const [bindingKey, binding] of this.sessionChangesBindings) {
      this.closeSessionChangesBinding(bindingKey, binding)
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

function sessionTarget(request: SpoolExecutionHostSessionReadRequest) {
  return {
    worktreeId: request.worktreeId,
    instanceId: request.worktreeInstanceId,
    spoolIncarnationId: request.spoolIncarnationId
  }
}

function sessionChangesBindingKey(environmentId: string, worktreeId: string): string {
  return JSON.stringify([environmentId, worktreeId])
}

function sessionTargetIdentity(request: SpoolExecutionHostSessionReadRequest): string {
  return JSON.stringify([request.worktreeInstanceId, request.spoolIncarnationId])
}
