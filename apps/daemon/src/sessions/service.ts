import type {
  AgentSessionFollowupInput,
  AgentSessionStartInput,
  RuntimeAgentProvider,
  RuntimeAgentSession
} from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import { getAgentProvider, listAgentProviders } from '../agents/catalog'
import type { WorktreeCatalog } from '../git/worktree/worktrees'
import type { HostRegistry } from '../hosts/registry'
import type { WorkbenchAgentSession } from '../runtime/host/agent-sessions'
import type { WorkbenchRuntimeBridge } from '../workbench/runtime'
import type { AgentSessionStore } from './store'

export class AgentSessionService {
  private readonly store: AgentSessionStore
  private readonly runtime: WorkbenchRuntimeBridge
  private readonly hosts: HostRegistry
  private readonly worktrees: WorktreeCatalog

  constructor(
    store: AgentSessionStore,
    runtime: WorkbenchRuntimeBridge,
    hosts: HostRegistry,
    worktrees: WorktreeCatalog
  ) {
    this.store = store
    this.runtime = runtime
    this.hosts = hosts
    this.worktrees = worktrees
  }

  async providers(hostId: ExecutionHostId = 'local'): Promise<RuntimeAgentProvider[]> {
    const host = this.hosts.get(hostId)
    return Promise.all(
      listAgentProviders().map(async (provider) => {
        const executable = await findExecutable(host, provider.executableCandidates)
        return {
          available: executable !== null,
          executable,
          id: provider.id,
          label: provider.label,
          resumable: provider.resumable
        }
      })
    )
  }

  async list(worktreeId?: string): Promise<RuntimeAgentSession[]> {
    const liveSessions = await this.runtime.listWorkbenchAgentSessions(worktreeId)
    const liveByHandle = new Map(liveSessions.map((session) => [session.terminalHandle, session]))
    const stored = await Promise.all(
      this.store.list(worktreeId).map(async (session) => {
        const live = liveByHandle.get(session.terminalHandle)
        const isConnected =
          live !== undefined ||
          (await this.runtime.hasWorkbenchTerminal(session.worktreeId, session.terminalHandle))
        if (isConnected) {
          const phase =
            live?.phase ??
            this.runtime.getWorkbenchAgentPhase(session.terminalHandle) ??
            session.phase
          const status = phase === 'complete' ? 'complete' : 'running'
          return phase === session.phase && session.status === status
            ? session
            : this.store.update(session.id, { phase, status })
        }
        return session.status === 'running'
          ? this.store.update(session.id, { phase: 'complete', status: 'interrupted' })
          : session
      })
    )
    const storedHandles = new Set(stored.map((session) => session.terminalHandle))
    const discovered = liveSessions
      .filter((session) => !storedHandles.has(session.terminalHandle))
      .map(toRuntimeAgentSession)
      .filter((session): session is RuntimeAgentSession => session !== null)
    return [...discovered, ...stored].sort((left, right) => right.updatedAt - left.updatedAt)
  }

  async start(input: AgentSessionStartInput): Promise<RuntimeAgentSession> {
    const provider = getAgentProvider(input.agent)
    const worktree = await this.worktrees.resolve(input.worktreeId)
    const executable = await findExecutable(
      this.hosts.get(worktree.hostId),
      provider.executableCandidates
    )
    if (!executable) {
      throw new Error(`agent_provider_unavailable:${input.agent}`)
    }
    const created = await this.runtime.launchWorkbenchAgent(
      input.worktreeId,
      input.prompt?.trim() ?? '',
      input.title ?? provider.label,
      provider.id
    )
    const session = this.store.create({
      agent: provider.id,
      terminalHandle: created.terminalHandle,
      title: input.title ?? provider.label,
      worktreeId: input.worktreeId
    })
    return session
  }

  async followup(
    input: AgentSessionFollowupInput
  ): Promise<{ accepted: boolean; session: RuntimeAgentSession }> {
    const session = await this.resolveSession(input.sessionId)
    if (session.status !== 'running') {
      return { accepted: false, session }
    }
    const accepted = await this.runtime.sendWorkbenchAgentPrompt(
      session.terminalHandle,
      input.prompt
    )
    return { accepted, session }
  }

  async stop(sessionId: string): Promise<RuntimeAgentSession> {
    const session = await this.resolveSession(sessionId)
    if (session.status === 'running') {
      await this.runtime.closeWorkbenchTerminal(session.terminalHandle)
    }
    const completedAt = Date.now()
    return this.store.find(session.id)
      ? this.store.update(session.id, { phase: 'complete', status: 'complete' })
      : {
          ...session,
          completedAt,
          phase: 'complete',
          status: 'complete',
          updatedAt: completedAt
        }
  }

  private async resolveSession(sessionId: string): Promise<RuntimeAgentSession> {
    const stored = this.store.find(sessionId)
    if (stored) {
      return stored
    }
    const live = (await this.runtime.listWorkbenchAgentSessions()).find(
      (session) => session.terminalHandle === sessionId
    )
    const session = live ? toRuntimeAgentSession(live) : null
    if (!session) {
      throw new Error('agent_session_not_found')
    }
    return session
  }
}

function toRuntimeAgentSession(session: WorkbenchAgentSession): RuntimeAgentSession | null {
  const provider = listAgentProviders().find((candidate) => candidate.id === session.agentType)
  if (!provider) {
    return null
  }
  const isComplete = session.phase === 'complete'
  return {
    agent: provider.id,
    completedAt: isComplete ? session.receivedAt : null,
    createdAt: session.startedAt,
    id: session.terminalHandle,
    phase: session.phase,
    status: isComplete ? 'complete' : 'running',
    terminalHandle: session.terminalHandle,
    title: session.title ?? provider.label,
    updatedAt: session.receivedAt,
    worktreeId: session.worktreeId
  }
}

async function findExecutable(
  host: ReturnType<HostRegistry['get']>,
  candidates: readonly string[]
): Promise<string | null> {
  for (const candidate of candidates) {
    const executable = await host.which(candidate)
    if (executable) {
      return executable
    }
  }
  return null
}
