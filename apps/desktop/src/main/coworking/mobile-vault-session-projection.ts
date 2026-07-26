import { createHash } from 'node:crypto'

import type { AiVaultSession } from '@yiru/workbench-model/agent'
import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'

import {
  resolveCoworkingLiveSessionIdentity,
  coworkingObservedAgentProvider
} from './live-session-display-identity'
import { normalizeOwnerHistoricalSessionRecord } from './owner/session-records'
import type {
  CoworkingHistoricalSessionCandidate,
  CoworkingLiveSessionCandidate,
  CoworkingSessionClientTab,
  CoworkingSessionWorktreeIdentity
} from './session/source'
import type { CoworkingTerminalSessionBindings } from './terminal-session-bindings'

const MAX_PROVIDER_SESSION_ID_LENGTH = 512
const MAX_TERMINAL_HANDLE_LENGTH = 2_048

export type ReadyMobileSessionTerminalTab = Extract<CoworkingSessionClientTab, { status: 'ready' }>

export function isReadyMobileSessionTerminalTab(
  tab: CoworkingSessionClientTab
): tab is ReadyMobileSessionTerminalTab {
  return tab.type === 'terminal' && tab.status === 'ready'
}

export function projectMobileVaultLiveTab(
  worktree: CoworkingSessionWorktreeIdentity,
  tab: ReadyMobileSessionTerminalTab,
  binding: ReturnType<CoworkingTerminalSessionBindings['resolve']>
): CoworkingLiveSessionCandidate | null {
  if (tab.worktreeInstanceId !== worktree.instanceId) {
    // Why: path-only and legacy PTY bindings cannot attest the current worktree instance.
    return null
  }
  const terminalHandle = normalizeCoworkingSessionIdentifier(
    tab.terminal,
    MAX_TERMINAL_HANDLE_LENGTH
  )
  if (!terminalHandle) {
    return null
  }
  const observedProvider = coworkingObservedAgentProvider(tab.agentStatus?.agentType)
  const observedProviderSessionId = observedProvider
    ? normalizeCoworkingSessionIdentifier(
        tab.agentStatus?.providerSession?.id,
        MAX_PROVIDER_SESSION_ID_LENGTH
      )
    : null
  const identity = resolveCoworkingLiveSessionIdentity({
    observedAgentType: tab.agentStatus?.agentType,
    observedProviderSessionId,
    // Why: paired-runtime metadata is already host-validated and avoids fabricating agent status.
    binding: tab.coworkingLiveSessionIdentity ?? binding,
    launchAgent: tab.launchAgent
  })
  return {
    sessionKey: binding?.sessionKey ?? tab.coworkingSessionKey ?? null,
    terminalHandle,
    executionHostId: worktree.target.executionHostId,
    actualHostScope: worktree.actualHostScope,
    worktreeInstanceId: worktree.instanceId,
    coworkingIncarnationId: worktree.coworkingIncarnationId,
    ...identity,
    title: binding?.title ?? tab.title
  }
}

export function projectMobileVaultHistoricalSession(
  worktree: CoworkingSessionWorktreeIdentity,
  session: AiVaultSession
): CoworkingHistoricalSessionCandidate | null {
  if (
    session.subagent !== null ||
    (session.agent !== 'claude' && session.agent !== 'codex') ||
    normalizeExecutionHostId(session.executionHostId) !== worktree.target.executionHostId
  ) {
    return null
  }
  const providerSessionId = normalizeCoworkingSessionIdentifier(
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
    coworkingIncarnationId: worktree.coworkingIncarnationId,
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

export function normalizeCoworkingSessionIdentifier(
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
  worktree: CoworkingSessionWorktreeIdentity,
  session: AiVaultSession
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        worktree.actualHostScope,
        worktree.instanceId,
        worktree.coworkingIncarnationId,
        session.id
      ])
    )
    .digest('base64url')
}

function normalizeCwd(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
