import type { RuntimeMobileSessionTabsResult } from '../../../../shared/runtime-types'
import type { SpoolPairedRuntimeResolvedWorktree } from '../../../../shared/spool/spool-paired-runtime-host-contract'
import {
  SpoolPairedRuntimeObservedProviderSessionSchema,
  type SpoolPairedRuntimeObservedProviderSession
} from '../../../../shared/spool/spool-paired-runtime-session-contract'
import { SPOOL_MAX_LIVE_SESSIONS_PER_WORKTREE } from '../../../../shared/spool/spool-resource-limits'
import type { SpoolTerminalSessionBindings } from '../../../spool/spool-terminal-session-bindings'

type SessionChangeWorktree = SpoolPairedRuntimeResolvedWorktree & {
  actualHostScope: string
  spoolIncarnationId: string
}

/** Projects only the positive provider identity proof needed outside the actual host. */
export function projectSpoolHostObservedProviderSessions(
  snapshot: RuntimeMobileSessionTabsResult,
  worktree: SessionChangeWorktree,
  sessionBindings: SpoolTerminalSessionBindings
): readonly SpoolPairedRuntimeObservedProviderSession[] {
  if (snapshot.worktree !== worktree.worktreeId) {
    return []
  }
  const projected: SpoolPairedRuntimeObservedProviderSession[] = []
  const seen = new Set<string>()
  for (const tab of snapshot.tabs) {
    if (
      tab.type !== 'terminal' ||
      tab.status !== 'ready' ||
      tab.worktreeInstanceId !== worktree.instanceId
    ) {
      continue
    }
    const provider = observedProvider(tab.agentStatus?.agentType)
    const providerSessionId = normalizeProviderSessionId(tab.agentStatus?.providerSession?.id)
    if (!provider || !providerSessionId) {
      continue
    }
    const key = `${provider}:${providerSessionId}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const binding = sessionBindings.resolveForExecutionHost(worktree, tab.terminal)
    if (binding) {
      sessionBindings.observeProviderSession(tab.terminal, provider, providerSessionId, {
        worktreeId: worktree.worktreeId,
        worktreeInstanceId: worktree.instanceId
      })
    }
    projected.push(
      SpoolPairedRuntimeObservedProviderSessionSchema.parse({
        provider,
        providerSessionId,
        sessionKey: binding?.sessionKey ?? null
      })
    )
    if (projected.length >= SPOOL_MAX_LIVE_SESSIONS_PER_WORKTREE) {
      break
    }
  }
  return projected
}

function observedProvider(value: string | null | undefined): 'claude' | 'codex' | null {
  return value === 'claude' || value === 'codex' ? value : null
}

function normalizeProviderSessionId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > 512) {
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
