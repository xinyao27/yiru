import type { StateCreator } from 'zustand'
import { dropAgentStatusOnHost } from '~renderer/runtime/agent-status-client'

import type { AppState } from '../../store/types'
import { capRetainedAgents } from './retention-model'
import type { RetainedAgentEntry, AgentStatusSlice } from './slice'
import { mergeCurrentOrchestrationContext } from './state-model'

export function createAgentStatusRetainedActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1]
): Pick<
  AgentStatusSlice,
  | 'retainAgents'
  | 'dismissRetainedAgent'
  | 'dismissRetainedAgentsByWorktree'
  | 'pruneRetainedAgents'
  | 'clearRetentionSuppressedPaneKeys'
> {
  return {
    retainAgents: (entries) => {
      // Why: retained entries are a pure read-overlay — consumers read
      // retainedAgentsByPaneKey directly each render, so no sort/status epoch
      // bump is needed. Retention does not participate in sort ordering.
      // Batching into a single set(...) keeps multi-agent disappearance atomic.
      if (entries.length === 0) {
        return
      }
      set((s) => {
        // Why: skip the allocation + set(...) entirely when every input entry
        // is already present by reference. Consumers of retainedAgentsByPaneKey
        // select on its identity (the inline agents list), so a spurious map
        // reallocation forces re-renders even when nothing changed. Mirrors
        // the identity-preservation pattern used by pruneRetainedAgents and
        // clearRetentionSuppressedPaneKeys.
        let changed = false
        for (const retained of entries) {
          if (s.retainedAgentsByPaneKey[retained.entry.paneKey] !== retained) {
            changed = true
            break
          }
        }
        if (!changed) {
          return s
        }
        const next = { ...s.retainedAgentsByPaneKey }
        for (const retained of entries) {
          const runtimeOrchestration = s.runtimeAgentOrchestrationByPaneKey[retained.entry.paneKey]
          const mergedOrchestration = runtimeOrchestration
            ? mergeCurrentOrchestrationContext(retained.entry.orchestration, runtimeOrchestration)
            : retained.entry.orchestration
          const entry =
            mergedOrchestration !== retained.entry.orchestration
              ? { ...retained.entry, orchestration: mergedOrchestration }
              : retained.entry
          // Why: INVARIANT — the map key equals retained.entry.paneKey. This
          // lets callers look up a retained row by the same paneKey they use
          // for agentStatusByPaneKey and keeps dismissal (dismissRetainedAgent)
          // keyed on a single identifier. collectRetainedAgentsOnDisappear
          // relies on this invariant too: it checks
          // `retainedAgentsByPaneKey[paneKey]` to decide whether a vanished
          // agent is already retained.
          next[retained.entry.paneKey] =
            entry === retained.entry ? retained : { ...retained, entry }
        }
        // Why: bound the map so a long multi-agent session cannot leak the
        // renderer heap. retainAgents is the only path that grows it, so
        // capping here is sufficient; evicts oldest-retained first.
        return { retainedAgentsByPaneKey: capRetainedAgents(next) }
      })
    },
    dismissRetainedAgent: (paneKey) => {
      // Why: no agentStatusEpoch / sortEpoch bump here (mirrors retainAgents).
      // Retained rows are a pure read-overlay on top of agentStatusByPaneKey —
      // they do not contribute to smart-sort class resolution (see
      // resolveAttention in smart-attention.ts, which reads
      // agentStatusByPaneKey only) and dashboard
      // selectors re-render on retainedAgentsByPaneKey identity changes
      // directly. Bumping epochs would force sidebar re-sorts and selector
      // recomputations for a change that cannot affect either result.
      set((s) => {
        if (!(paneKey in s.retainedAgentsByPaneKey)) {
          return s
        }
        const next = { ...s.retainedAgentsByPaneKey }
        delete next[paneKey]
        // Why: mirror dropAgentStatus's hasLive-gated suppressor. If the same
        // paneKey has BOTH a retained entry AND a concurrent live entry, simply
        // removing the retained row leaves the live entry free to vanish
        // cleanly on its next disappearance — and because
        // collectRetainedAgentsOnDisappear (use-retained-agents.ts) only skips
        // paneKeys that are currently in retainedAgentsByPaneKey, the
        // just-dismissed row would be resurrected by a new retention snapshot.
        // Plant a one-shot suppressor so the next live→gone transition for
        // this paneKey is ignored by the retention sync.
        //
        // Gate on `paneKey in agentStatusByPaneKey`: with no live entry there
        // is no live→gone transition to guard against, and a stray suppressor
        // would leak indefinitely (same rationale as dropAgentStatus).
        const hasLive = paneKey in s.agentStatusByPaneKey
        if (!hasLive || paneKey in s.retentionSuppressedPaneKeys) {
          return { retainedAgentsByPaneKey: next }
        }
        return {
          retainedAgentsByPaneKey: next,
          retentionSuppressedPaneKeys: {
            ...s.retentionSuppressedPaneKeys,
            [paneKey]: true
          }
        }
      })
    },
    dismissRetainedAgentsByWorktree: (worktreeId) => {
      // Why: collect inside set so we capture the exact paneKeys removed
      // (worktree filter is applied here). After the synchronous set()
      // returns, fan out one host-side agent-status drop per removed key so
      // the main-process hook cache (and on-disk last-status file) eviction
      // matches the renderer's removal. Without this, the on-disk cache
      // would resurrect the dismissed rows on the next launch.
      const dismissedPaneKeys: string[] = []
      set((s) => {
        let changed = false
        const next: Record<string, RetainedAgentEntry> = {}
        // Why: mirror dismissRetainedAgent's hasLive-gated suppressor logic.
        // When a dismissed paneKey ALSO has a concurrent live entry in
        // agentStatusByPaneKey, removing the retained row alone lets the next
        // live→gone transition for that paneKey re-retain the row via the
        // retention sync (collectRetainedAgentsOnDisappear only skips paneKeys
        // currently present in retainedAgentsByPaneKey). Without planting a
        // suppressor here, "Dismiss all" for a worktree would silently
        // resurrect the just-dismissed rows as soon as the live agents
        // disappeared. Only plant suppressors for the hasLive subset — a stray
        // suppressor on a retained-only paneKey would leak indefinitely
        // because no live→gone transition would ever consume it.
        const toSuppress: string[] = []
        for (const [key, ra] of Object.entries(s.retainedAgentsByPaneKey)) {
          if (ra.worktreeId === worktreeId) {
            changed = true
            dismissedPaneKeys.push(key)
            if (key in s.agentStatusByPaneKey && !(key in s.retentionSuppressedPaneKeys)) {
              toSuppress.push(key)
            }
            continue
          }
          next[key] = ra
        }
        if (!changed) {
          return s
        }
        if (toSuppress.length === 0) {
          return { retainedAgentsByPaneKey: next }
        }
        const nextSuppressed = { ...s.retentionSuppressedPaneKeys }
        for (const key of toSuppress) {
          nextSuppressed[key] = true
        }
        return {
          retainedAgentsByPaneKey: next,
          retentionSuppressedPaneKeys: nextSuppressed
        }
      })
      if (typeof window !== 'undefined') {
        for (const paneKey of dismissedPaneKeys) {
          dropAgentStatusOnHost(paneKey)
        }
      }
    },
    pruneRetainedAgents: (validWorktreeIds) => {
      // Why: deliberately does NOT sweep retentionSuppressedPaneKeys for
      // pruned worktrees. PaneKeys are minted fresh when a worktree is
      // re-created (worktrees keep unique tab IDs), so stale suppressors
      // keyed on pruned paneKeys can never be matched by a future live entry
      // — they are inert and harmless. Sweeping them would add churn for no
      // observable benefit.
      set((s) => {
        let changed = false
        const next: Record<string, RetainedAgentEntry> = {}
        for (const [key, ra] of Object.entries(s.retainedAgentsByPaneKey)) {
          if (!validWorktreeIds.has(ra.worktreeId)) {
            changed = true
            continue
          }
          next[key] = ra
        }
        return changed ? { retainedAgentsByPaneKey: next } : s
      })
    },
    clearRetentionSuppressedPaneKeys: (paneKeys) => {
      set((s) => {
        let changed = false
        const next = { ...s.retentionSuppressedPaneKeys }
        for (const paneKey of paneKeys) {
          if (!(paneKey in next)) {
            continue
          }
          delete next[paneKey]
          changed = true
        }
        return changed ? { retentionSuppressedPaneKeys: next } : s
      })
    }
  }
}
