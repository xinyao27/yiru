import { createHash } from 'node:crypto'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { normalizeExecutionHostId } from '../../shared/execution-host'
import { normalizeOwnerHistoricalSessionRecord } from './spool-owner-session-records'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolLiveSessionCandidate,
  SpoolSessionClientTab,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'
import {
  resolveSpoolLiveSessionIdentity,
  spoolObservedAgentProvider
} from './spool-live-session-display-identity'

const MAX_PROVIDER_SESSION_ID_LENGTH = 512
const MAX_TERMINAL_HANDLE_LENGTH = 2_048

export type ReadyMobileSessionTerminalTab = Extract<SpoolSessionClientTab, { status: 'ready' }>

export function isReadyMobileSessionTerminalTab(
  tab: SpoolSessionClientTab
): tab is ReadyMobileSessionTerminalTab {
  return tab.type === 'terminal' && tab.status === 'ready'
}

export function projectMobileVaultLiveTab(
  worktree: SpoolSessionWorktreeIdentity,
  tab: ReadyMobileSessionTerminalTab,
  binding: ReturnType<SpoolTerminalSessionBindings['resolve']>
): SpoolLiveSessionCandidate | null {
  if (tab.worktreeInstanceId !== worktree.instanceId) {
    // Why: path-only and legacy PTY bindings cannot attest the current worktree instance.
    return null
  }
  const terminalHandle = normalizeSpoolSessionIdentifier(tab.terminal, MAX_TERMINAL_HANDLE_LENGTH)
  if (!terminalHandle) {
    return null
  }
  const observedProvider = spoolObservedAgentProvider(tab.agentStatus?.agentType)
  const observedProviderSessionId = observedProvider
    ? normalizeSpoolSessionIdentifier(
        tab.agentStatus?.providerSession?.id,
        MAX_PROVIDER_SESSION_ID_LENGTH
      )
    : null
  const identity = resolveSpoolLiveSessionIdentity({
    observedAgentType: tab.agentStatus?.agentType,
    observedProviderSessionId,
    // Why: paired-runtime metadata is already host-validated and avoids fabricating agent status.
    binding: tab.spoolLiveSessionIdentity ?? binding,
    launchAgent: tab.launchAgent
  })
  return {
    sessionKey: binding?.sessionKey ?? tab.spoolSessionKey ?? null,
    terminalHandle,
    executionHostId: worktree.target.executionHostId,
    actualHostScope: worktree.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    ...identity,
    title: binding?.title ?? tab.title
  }
}

export function projectMobileVaultHistoricalSession(
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
  const providerSessionId = normalizeSpoolSessionIdentifier(
    session.sessionId,
    MAX_PROVIDER_SESSION_ID_LENGTH
  )
  if (!providerSessionId) {
    return null
  }
  const ownerRecordKey = historicalRecordKey(worktree, session)
  const ownerRecord = normalizeOwnerHistoricalSessionRecord({
    ownerRecordKey,
    executionHostId: worktree.target.executionHostId,
    actualHostScope: worktree.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId: worktree.spoolIncarnationId,
    provider: session.agent,
    providerSessionId,
    title: session.title,
    transcriptPath: session.filePath,
    resumeCommand: session.resumeCommand
  })
  if (!ownerRecord) {
    return null
  }
  return {
    ownerRecordKey,
    ownerRecord,
    executionHostId: worktree.target.executionHostId,
    actualHostScope: worktree.actualHostScope,
    provider: session.agent,
    providerSessionId,
    title: session.title,
    attestationCwd: normalizeCwd(session.cwd)
  }
}

export function normalizeSpoolSessionIdentifier(
  value: string | null | undefined,
  maxLength: number
): string | null {
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

function historicalRecordKey(
  worktree: SpoolSessionWorktreeIdentity,
  session: AiVaultSession
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        worktree.actualHostScope,
        worktree.instanceId,
        worktree.spoolIncarnationId,
        session.id
      ])
    )
    .digest('base64url')
}

function normalizeCwd(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
