import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'

import type { RuntimeMobileSessionTerminalClientTab } from '../../../../shared/runtime-types'
import type { SpoolPairedRuntimeResolvedWorktree } from '../../../../shared/spool/spool-paired-runtime-host-contract'
import {
  SpoolPairedRuntimeHistoricalSessionSchema,
  SpoolPairedRuntimeLiveSessionSchema
} from '../../../../shared/spool/spool-paired-runtime-session-contract'
import { SpoolExecutionError } from '../../../spool/spool-execution-error'
import {
  resolveSpoolLiveSessionIdentity,
  spoolObservedAgentProvider
} from '../../../spool/spool-live-session-display-identity'
import type {
  SpoolExecutionHostSessionReader,
  SpoolHistoricalSessionPurpose
} from '../../../spool/spool-session-source'
import type { SpoolTerminalSessionBindings } from '../../../spool/spool-terminal-session-bindings'
import type { YiruRuntimeService } from '../../yiru-runtime'

type SessionRuntime = Pick<YiruRuntimeService, 'listMobileSessionTabs'>
type ReadyMobileSessionTerminalTab = Extract<
  RuntimeMobileSessionTerminalClientTab,
  { status: 'ready' }
>
type PairedRuntimeLiveSessionWorktree = SpoolPairedRuntimeResolvedWorktree & {
  actualHostScope: string
  spoolIncarnationId: string
}

const MAX_HISTORICAL_SESSION_PAGE_BYTES = 4 * 1024 * 1024

export async function projectPairedRuntimeLiveSessions(
  runtime: SessionRuntime,
  sessionBindings: SpoolTerminalSessionBindings,
  worktree: PairedRuntimeLiveSessionWorktree,
  signal?: AbortSignal
) {
  const snapshot = await runtime.listMobileSessionTabs(`id:${worktree.worktreeId}`)
  signal?.throwIfAborted()
  if (snapshot.worktree !== worktree.worktreeId) {
    throw new Error('paired_runtime_session_worktree_mismatch')
  }
  const readyTabs = snapshot.tabs.filter(
    (tab): tab is ReadyMobileSessionTerminalTab =>
      tab.type === 'terminal' &&
      tab.status === 'ready' &&
      tab.worktreeInstanceId === worktree.instanceId
  )
  sessionBindings.reconcile(worktree, new Set(readyTabs.map((tab) => tab.terminal)))
  const sessions: ReturnType<typeof SpoolPairedRuntimeLiveSessionSchema.parse>[] = []
  for (const tab of readyTabs) {
    const binding = sessionBindings.resolveForExecutionHost(worktree, tab.terminal)
    const observedProvider = spoolObservedAgentProvider(tab.agentStatus?.agentType)
    const observedProviderSessionId = observedProvider
      ? normalizeIdentifier(tab.agentStatus?.providerSession?.id, 512)
      : null
    let currentBinding = binding
    if (currentBinding && observedProvider && observedProviderSessionId) {
      currentBinding =
        sessionBindings.observeProviderSession(
          tab.terminal,
          observedProvider,
          observedProviderSessionId,
          { worktreeId: worktree.worktreeId, worktreeInstanceId: worktree.instanceId }
        ) ?? currentBinding
    }
    const identity = resolveSpoolLiveSessionIdentity({
      observedAgentType: tab.agentStatus?.agentType,
      observedProviderSessionId,
      binding: currentBinding,
      launchAgent: tab.launchAgent
    })
    const parsed = SpoolPairedRuntimeLiveSessionSchema.safeParse({
      terminalRef: tab.terminal,
      title: currentBinding?.title ?? tab.title,
      isActive: tab.isActive,
      ...identity,
      sessionKey: currentBinding?.sessionKey ?? null
    })
    if (parsed.success) {
      sessions.push(parsed.data)
    }
  }
  return { sessions }
}

export async function projectPairedRuntimeHistoricalSessionPage(
  reader: Pick<
    SpoolExecutionHostSessionReader,
    'listAiVaultSessionPage' | 'releaseAiVaultSessionPage'
  >,
  worktree: SpoolPairedRuntimeResolvedWorktree,
  spoolIncarnationId: string,
  purpose: SpoolHistoricalSessionPurpose,
  inventoryScope: string,
  cursor: string | null,
  signal?: AbortSignal
) {
  const request = pairedRuntimeHistoricalSessionReadRequest(
    worktree,
    spoolIncarnationId,
    purpose,
    inventoryScope
  )
  const result = await reader.listAiVaultSessionPage(request, cursor, signal)
  try {
    signal?.throwIfAborted()
    const sessions: ReturnType<typeof SpoolPairedRuntimeHistoricalSessionSchema.parse>[] = []
    let projectedBytes = 2
    for (const session of result.sessions) {
      if (
        session.subagent !== null ||
        (session.agent !== 'claude' && session.agent !== 'codex') ||
        normalizeExecutionHostId(session.executionHostId) !== worktree.executionHostId
      ) {
        // Why: silently dropping a malformed row could turn a partial page into completeness.
        throw new Error('paired_runtime_historical_session_scope_mismatch')
      }
      const providerSessionId = normalizeIdentifier(session.sessionId, 512)
      if (!providerSessionId) {
        throw new Error('paired_runtime_historical_session_identifier_invalid')
      }
      const parsed = SpoolPairedRuntimeHistoricalSessionSchema.parse({
        sessionRef: session.id,
        title: session.title,
        provider: session.agent,
        providerSessionId,
        cwd: session.cwd,
        transcriptPath: session.filePath,
        resumeCommand: session.resumeCommand
      })
      projectedBytes +=
        Buffer.byteLength(JSON.stringify(parsed), 'utf8') + (sessions.length > 0 ? 1 : 0)
      sessions.push(parsed)
      if (projectedBytes > MAX_HISTORICAL_SESSION_PAGE_BYTES) {
        // Why: locator-heavy pages fail explicitly before they can saturate the encrypted route.
        throw new SpoolExecutionError('result_too_large')
      }
    }
    return { sessions, nextCursor: result.nextCursor, scannedAt: result.scannedAt }
  } catch (error) {
    try {
      await reader.releaseAiVaultSessionPage(request, result.nextCursor ?? cursor)
    } catch {
      // Preserve the projection failure; cursor expiry remains a bounded cleanup fallback.
    }
    throw error
  }
}

export function pairedRuntimeHistoricalSessionReadRequest(
  worktree: SpoolPairedRuntimeResolvedWorktree,
  spoolIncarnationId: string,
  purpose: SpoolHistoricalSessionPurpose,
  inventoryScope: string
) {
  return {
    worktreeKind: worktree.kind,
    executionHostId: worktree.executionHostId,
    worktreeId: worktree.worktreeId,
    worktreeInstanceId: worktree.instanceId,
    spoolIncarnationId,
    worktreePath: worktree.worktreePath,
    localWslDistro: worktree.localWslDistro,
    purpose,
    inventoryScope
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
