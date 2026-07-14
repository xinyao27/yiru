import { createHash } from 'node:crypto'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { normalizeExecutionHostId } from '../../shared/execution-host'
import type { RuntimeMobileSessionTerminalClientTab } from '../../shared/runtime-types'
import type {
  SpoolExecutionHostSessionReader,
  SpoolHistoricalSessionCandidate,
  SpoolHistoricalSessionPurpose,
  SpoolLiveSessionCandidate,
  SpoolOwnerHistoricalSessionRecord,
  SpoolSessionProvider,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolOwnerSessionRecords } from './spool-owner-session-records'
import type { SpoolContinuedSessionBindings } from './spool-continued-session-bindings'

const MAX_PROVIDER_SESSION_ID_LENGTH = 512
const MAX_TERMINAL_HANDLE_LENGTH = 2048

type ReadyMobileSessionTerminalTab = Extract<
  RuntimeMobileSessionTerminalClientTab,
  { status: 'ready' }
>

export class SpoolMobileVaultSessionSource implements SpoolSessionSource {
  constructor(
    private readonly reader: SpoolExecutionHostSessionReader,
    private readonly ownerRecords: SpoolOwnerSessionRecords,
    private readonly continued: SpoolContinuedSessionBindings
  ) {}

  async listLiveSessions(
    worktree: SpoolSessionWorktreeIdentity
  ): Promise<readonly SpoolLiveSessionCandidate[]> {
    const request = toReadRequest(worktree, 'catalog')
    const snapshot = await this.reader.listMobileSessionTabs(request)
    if (!snapshot || snapshot.worktree !== worktree.worktreeId) {
      return []
    }
    const readyTabs = snapshot.tabs.filter(
      (tab): tab is ReadyMobileSessionTerminalTab =>
        tab.type === 'terminal' && tab.status === 'ready'
    )
    this.continued.reconcile(worktree, new Set(readyTabs.map((tab) => tab.terminal)))
    return readyTabs
      .map((tab) => projectLiveTab(worktree, tab, this.continued.resolve(worktree, tab.terminal)))
      .filter((session): session is SpoolLiveSessionCandidate => session !== null)
  }

  async listHistoricalSessions(
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose
  ): Promise<readonly SpoolHistoricalSessionCandidate[]> {
    const result = await this.reader.listAiVaultSessions(toReadRequest(worktree, purpose))
    const candidates: SpoolHistoricalSessionCandidate[] = []
    for (const session of result.sessions) {
      const candidate = projectHistoricalSession(worktree, session)
      if (candidate && this.ownerRecords.remember(worktree, candidate, session)) {
        candidates.push(candidate)
      }
    }
    return candidates
  }

  resolveOwnerHistoricalRecord(ownerRecordKey: string): SpoolOwnerHistoricalSessionRecord | null {
    return this.ownerRecords.resolve(ownerRecordKey)
  }

  subscribe(listener: () => void): () => void {
    const unsubscribeReader = this.reader.subscribe?.(listener) ?? (() => {})
    const unsubscribeContinued = this.continued.subscribe(listener)
    return () => {
      unsubscribeReader()
      unsubscribeContinued()
    }
  }
}

function projectLiveTab(
  worktree: SpoolSessionWorktreeIdentity,
  tab: ReadyMobileSessionTerminalTab,
  continued: ReturnType<SpoolContinuedSessionBindings['resolve']>
): SpoolLiveSessionCandidate | null {
  const terminalHandle = normalizeIdentifier(tab.terminal, MAX_TERMINAL_HANDLE_LENGTH)
  if (!terminalHandle) {
    return null
  }
  const provider = continued?.provider ?? liveProvider(tab)
  const providerSessionId =
    continued?.providerSessionId ??
    (provider === 'claude' || provider === 'codex'
      ? normalizeIdentifier(tab.agentStatus?.providerSession?.id, MAX_PROVIDER_SESSION_ID_LENGTH)
      : null)
  return {
    terminalHandle,
    executionHostId: worktree.target.executionHostId,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    provider,
    providerSessionId,
    title: continued?.title ?? tab.title
  }
}

function historicalRecordKey(
  worktree: SpoolSessionWorktreeIdentity,
  session: AiVaultSession
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        worktree.target.executionHostId,
        worktree.instanceId,
        worktree.spoolIncarnationId,
        session.id
      ])
    )
    .digest('base64url')
}

function projectHistoricalSession(
  worktree: SpoolSessionWorktreeIdentity,
  session: AiVaultSession
): SpoolHistoricalSessionCandidate | null {
  if (
    session.subagent !== null ||
    (session.agent !== 'claude' && session.agent !== 'codex') ||
    normalizeExecutionHostId(session.executionHostId) !== worktree.target.executionHostId
  ) {
    return null
  }
  const providerSessionId = normalizeIdentifier(session.sessionId, MAX_PROVIDER_SESSION_ID_LENGTH)
  if (!providerSessionId) {
    return null
  }
  return {
    ownerRecordKey: historicalRecordKey(worktree, session),
    executionHostId: worktree.target.executionHostId,
    provider: session.agent,
    providerSessionId,
    title: session.title,
    attestationCwd: normalizeCwd(session.cwd)
  }
}

function liveProvider(tab: RuntimeMobileSessionTerminalClientTab): SpoolSessionProvider {
  const agent = tab.agentStatus?.agentType ?? tab.launchAgent
  if (agent === 'claude') {
    return 'claude'
  }
  if (agent === 'codex') {
    return 'codex'
  }
  return 'other'
}

function toReadRequest(
  worktree: SpoolSessionWorktreeIdentity,
  purpose: SpoolHistoricalSessionPurpose
) {
  return {
    executionHostId: worktree.target.executionHostId,
    worktreeId: worktree.worktreeId,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    worktreePath: worktree.target.worktreePath,
    purpose
  }
}

function normalizeIdentifier(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > maxLength) {
    return null
  }
  for (const character of trimmed) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) {
      return null
    }
  }
  return trimmed
}

function normalizeCwd(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
