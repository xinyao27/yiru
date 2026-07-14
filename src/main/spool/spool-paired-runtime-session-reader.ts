import { createHash } from 'node:crypto'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { parseExecutionHostId } from '../../shared/execution-host'
import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import type { RuntimeMobileSessionTerminalClientTab } from '../../shared/runtime-types'
import {
  SpoolPairedRuntimeHistoricalSessionsResponseSchema,
  SpoolPairedRuntimeListHistoricalSessionsParamsSchema,
  SpoolPairedRuntimeListLiveSessionsParamsSchema,
  SpoolPairedRuntimeLiveSessionsResponseSchema,
  SpoolPairedRuntimeSessionChangedEventSchema,
  SpoolPairedRuntimeSubscribeSessionChangesParamsSchema
} from '../../shared/spool/spool-paired-runtime-session-contract'
import {
  callRuntimeEnvironmentExistingRoute,
  subscribeRuntimeEnvironmentExistingRoute
} from '../ipc/runtime-environment-existing-route'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolExecutionHostSessionReader,
  SpoolExecutionHostSessionReadRequest
} from './spool-session-source'

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

  async listMobileSessionTabs(request: SpoolExecutionHostSessionReadRequest) {
    const environmentId = requireRuntimeEnvironment(request)
    const params = SpoolPairedRuntimeListLiveSessionsParamsSchema.parse({
      target: sessionTarget(request)
    })
    const response = await this.call(environmentId, 'spool.host.listLiveSessions', params)
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
    const tabs = envelope.data.result.sessions.map((session) => projectLiveTab(session))
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

  async listAiVaultSessions(request: SpoolExecutionHostSessionReadRequest) {
    const environmentId = requireRuntimeEnvironment(request)
    const params = SpoolPairedRuntimeListHistoricalSessionsParamsSchema.parse({
      target: sessionTarget(request),
      purpose: request.purpose
    })
    const response = await this.call(environmentId, 'spool.host.listHistoricalSessions', params)
    if (!response.ok) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    const envelope = SpoolPairedRuntimeHistoricalSessionsResponseSchema.safeParse(response.result)
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
        projectHistoricalSession(request, result.scannedAt, session)
      ),
      issues: [],
      scannedAt: result.scannedAt
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

  private async call(environmentId: string, method: string, params: unknown) {
    try {
      return await callRuntimeEnvironmentExistingRoute(
        this.options.userDataPath,
        environmentId,
        method,
        params,
        this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
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

function projectLiveTab(session: {
  terminalRef: string
  title: string
  provider: 'claude' | 'codex' | 'other'
  providerSessionId: string | null
}): RuntimeMobileSessionTerminalClientTab {
  const id = `spool-paired-${shortHash(session.terminalRef)}`
  const knownProvider = session.provider === 'other' ? null : session.provider
  return {
    type: 'terminal',
    id,
    title: session.title,
    parentTabId: id,
    leafId: id,
    isActive: false,
    status: 'ready',
    terminal: session.terminalRef,
    ...(knownProvider ? { launchAgent: knownProvider } : {}),
    ...(knownProvider && session.providerSessionId
      ? {
          agentStatus: {
            state: 'done',
            prompt: '',
            updatedAt: 0,
            stateStartedAt: 0,
            agentType: knownProvider,
            paneKey: id,
            stateHistory: [],
            providerSession: { key: 'session_id', id: session.providerSessionId }
          }
        }
      : {})
  }
}

function projectHistoricalSession(
  request: SpoolExecutionHostSessionReadRequest,
  scannedAt: string,
  session: {
    sessionRef: string
    title: string
    provider: 'claude' | 'codex'
    providerSessionId: string
    cwd: string | null
    transcriptPath: string
    resumeCommand: string
  }
): AiVaultSession {
  return {
    id: session.sessionRef,
    executionHostId: request.executionHostId,
    agent: session.provider,
    sessionId: session.providerSessionId,
    title: session.title,
    cwd: session.cwd,
    branch: null,
    model: null,
    // Why: these fields are consumed into the owner-only record store before projection.
    filePath: session.transcriptPath,
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: scannedAt,
    messageCount: 0,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: session.resumeCommand,
    subagent: null
  }
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 22)
}
