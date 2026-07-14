import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import {
  SpoolPairedRuntimeHistoricalSessionSchema,
  SpoolPairedRuntimeLiveSessionSchema
} from '../../../../shared/spool/spool-paired-runtime-session-contract'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { SpoolPairedRuntimeResolvedWorktree } from '../../../../shared/spool/spool-paired-runtime-host-contract'

type SessionRuntime = Pick<OrcaRuntimeService, 'listMobileSessionTabs' | 'listAiVaultSessions'>

export async function projectPairedRuntimeLiveSessions(
  runtime: SessionRuntime,
  worktree: SpoolPairedRuntimeResolvedWorktree
) {
  const snapshot = await runtime.listMobileSessionTabs(`id:${worktree.worktreeId}`)
  if (snapshot.worktree !== worktree.worktreeId) {
    throw new Error('paired_runtime_session_worktree_mismatch')
  }
  const sessions: ReturnType<typeof SpoolPairedRuntimeLiveSessionSchema.parse>[] = []
  for (const tab of snapshot.tabs) {
    if (tab.type !== 'terminal' || tab.status !== 'ready') {
      continue
    }
    const agent = tab.agentStatus?.agentType ?? tab.launchAgent
    const provider = agent === 'claude' || agent === 'codex' ? agent : 'other'
    const providerSessionId =
      provider === 'other' ? null : normalizeIdentifier(tab.agentStatus?.providerSession?.id, 512)
    const parsed = SpoolPairedRuntimeLiveSessionSchema.safeParse({
      terminalRef: tab.terminal,
      title: tab.title,
      provider,
      providerSessionId
    })
    if (parsed.success) {
      sessions.push(parsed.data)
    }
  }
  return { sessions }
}

export async function projectPairedRuntimeHistoricalSessions(
  runtime: SessionRuntime,
  worktree: SpoolPairedRuntimeResolvedWorktree
) {
  const result = await runtime.listAiVaultSessions({
    limit: 5_000,
    force: false,
    scopePaths: [worktree.worktreePath],
    executionHostScope: worktree.executionHostId
  })
  const sessions: ReturnType<typeof SpoolPairedRuntimeHistoricalSessionSchema.parse>[] = []
  for (const session of result.sessions) {
    if (
      session.subagent !== null ||
      (session.agent !== 'claude' && session.agent !== 'codex') ||
      normalizeExecutionHostId(session.executionHostId) !== worktree.executionHostId
    ) {
      continue
    }
    const parsed = SpoolPairedRuntimeHistoricalSessionSchema.safeParse({
      sessionRef: session.id,
      title: session.title,
      provider: session.agent,
      providerSessionId: session.sessionId,
      cwd: session.cwd,
      transcriptPath: session.filePath,
      resumeCommand: session.resumeCommand
    })
    if (parsed.success) {
      sessions.push(parsed.data)
    }
  }
  return { sessions, scannedAt: result.scannedAt }
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
