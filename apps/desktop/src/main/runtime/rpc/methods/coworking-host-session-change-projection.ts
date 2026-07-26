import type { CoworkingPairedRuntimeResolvedWorktree } from '../../../../shared/coworking/paired-runtime-host-contract'
import {
  CoworkingPairedRuntimeObservedProviderSessionSchema,
  type CoworkingPairedRuntimeObservedProviderSession
} from '../../../../shared/coworking/paired-runtime-session-contract'
import { COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE } from '../../../../shared/coworking/resource-limits'
import type { RuntimeMobileSessionTabsResult } from '../../../../shared/runtime-types'
import type { CoworkingTerminalSessionBindings } from '../../../coworking/terminal-session-bindings'

type SessionChangeWorktree = CoworkingPairedRuntimeResolvedWorktree & {
  actualHostScope: string
  coworkingIncarnationId: string
}

/** Projects only the positive provider identity proof needed outside the actual host. */
export function projectCoworkingHostObservedProviderSessions(
  snapshot: RuntimeMobileSessionTabsResult,
  worktree: SessionChangeWorktree,
  sessionBindings: CoworkingTerminalSessionBindings
): readonly CoworkingPairedRuntimeObservedProviderSession[] {
  if (snapshot.worktree !== worktree.worktreeId) {
    return []
  }
  const projected: CoworkingPairedRuntimeObservedProviderSession[] = []
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
      CoworkingPairedRuntimeObservedProviderSessionSchema.parse({
        provider,
        providerSessionId,
        sessionKey: binding?.sessionKey ?? null
      })
    )
    if (projected.length >= COWORKING_MAX_LIVE_SESSIONS_PER_WORKTREE) {
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
