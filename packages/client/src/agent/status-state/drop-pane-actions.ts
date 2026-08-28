import type { StateCreator } from 'zustand'
import { dropAgentStatusOnHost } from '~renderer/runtime/agent-status-client'

import type { AppState } from '../../store/types'
import { findAgentPaneWorktreeId } from './retention-model'
import type { AgentStatusSlice } from './slice'
import {
  boundRecentlyRetiredAgentStatusPaneKeys,
  pruneMigrationUnsupportedEntries
} from './state-model'

export function createAgentStatusDropPaneActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<AgentStatusSlice, 'dropAgentStatus'> {
  return {
    dropAgentStatus: (paneKey) => {
      // Why: single sync read — zustand set is synchronous, so the value we
      // observe inside the set callback is the same one we would re-read via
      // get() immediately after. Capture it once from inside the callback
      // rather than double-reading the store before and during set.
      let liveExisted = false
      set((s) => {
        const hasLive = paneKey in s.agentStatusByPaneKey
        liveExisted = hasLive
        const hasRetained = paneKey in s.retainedAgentsByPaneKey
        const migrationUnsupported = pruneMigrationUnsupportedEntries(
          s.migrationUnsupportedByPtyId,
          (entry) => entry.paneKey === paneKey
        )
        // See removeAgentStatus for rationale on ack cleanup. Apply this
        // regardless of live/retained presence — the ack entry is owned by
        // the pane lifecycle independently of live/retained state.
        let nextAck = s.acknowledgedAgentsByPaneKey
        if (paneKey in nextAck) {
          nextAck = { ...nextAck }
          delete nextAck[paneKey]
        }
        const hasLaunchConfig = paneKey in s.agentLaunchConfigByPaneKey
        const nextLaunchConfigs = hasLaunchConfig
          ? { ...s.agentLaunchConfigByPaneKey }
          : s.agentLaunchConfigByPaneKey
        if (hasLaunchConfig) {
          delete nextLaunchConfigs[paneKey]
        }
        // Why: bail when there is genuinely nothing to do. The old guard
        // `!hasLive && !hasRetained && alreadySuppressed` leaked a phantom
        // suppressor write in the `!hasLive && !hasRetained && !alreadySuppressed`
        // case. With the hasLive-gated suppressor below, a no-op drop on a
        // paneKey with no live and no retained entry truly has nothing to
        // change, so short-circuit here — but still flush a pending ack
        // cleanup or launch-config cleanup if one is present.
        if (!hasLive && !hasRetained && !migrationUnsupported.changed) {
          if (hasLaunchConfig) {
            return {
              agentLaunchConfigByPaneKey: nextLaunchConfigs,
              ...(nextAck !== s.acknowledgedAgentsByPaneKey
                ? { acknowledgedAgentsByPaneKey: nextAck }
                : {})
            }
          }
          if (nextAck !== s.acknowledgedAgentsByPaneKey) {
            return { acknowledgedAgentsByPaneKey: nextAck }
          }
          return s
        }

        const nextLive = hasLive ? { ...s.agentStatusByPaneKey } : s.agentStatusByPaneKey
        if (hasLive) {
          delete nextLive[paneKey]
        }
        const nextRetained = hasRetained
          ? { ...s.retainedAgentsByPaneKey }
          : s.retainedAgentsByPaneKey
        if (hasRetained) {
          delete nextRetained[paneKey]
        }

        // Why: explicit teardown means "the user is done with this row", so
        // the next retention sync must not resurrect it from the previous frame.
        //
        // Why same-frame race is acceptable: if dropAgentStatus fires in the
        // same React frame as setAgentStatus, before useRetainedAgentsSync's
        // prevAgentsRef has captured the live entry, the planted suppressor
        // may never be consumed by a live→gone transition and would persist.
        // In practice suppressors are bounded by user-dismissed paneKeys (a
        // small set), so the leak is pragmatically inert — accepting it is
        // cheaper than threading frame-level ordering guarantees through the
        // retention sync.
        //
        // Why gate on hasLive: the suppressor is a one-shot flag consumed by
        // `collectRetainedAgentsOnDisappear` (use-retained-agents.ts), which
        // iterates the PREVIOUS render's LIVE agents to decide what to
        // retain. If we dismiss a retained-only row (no live entry at drop
        // time), no live→gone transition will ever fire for this paneKey, so
        // the suppressor would never be consumed and would leak indefinitely
        // — only clearing if the same paneKey later became live again via
        // setAgentStatus. A retained-only dismissal just needs the retained
        // entry removed; there is no live-agent resurrection risk to guard
        // against. Only spread retentionSuppressedPaneKeys when hasLive.
        //
        // Why the `!(paneKey in s.retentionSuppressedPaneKeys)` check: if a
        // suppressor is already present, re-spreading produces a new object
        // reference with identical contents and spuriously re-renders any
        // subscriber selecting on retentionSuppressedPaneKeys. Mirror the
        // guard used in setAgentStatus.
        const needsSuppressorWrite = hasLive && !(paneKey in s.retentionSuppressedPaneKeys)

        // Why: when no tab in this renderer owns the pane, deleting the entry
        // is not enough. Such rows only exist because the sidebar keeps
        // worktree-attributed statuses whose tab never arrived (or was
        // reconciled away), and the agent behind them can still be alive in a
        // pane we no longer track — its next hook ping re-adds the row within
        // seconds, so the dismiss X reads as dead. Retire the paneKey the way
        // dropAgentStatusByTabPrefix retires a closed tab's panes; setAgentStatus
        // then refuses late pings for it. paneKeys embed tab+leaf uuids that
        // never recur, so this cannot block a pane the user can still reach.
        const needsRetirementWrite =
          findAgentPaneWorktreeId(s, paneKey) === null &&
          !(paneKey in s.recentlyRetiredAgentStatusPaneKeys)

        return {
          agentStatusByPaneKey: nextLive,
          agentLaunchConfigByPaneKey: nextLaunchConfigs,
          retainedAgentsByPaneKey: nextRetained,
          migrationUnsupportedByPtyId: migrationUnsupported.next,
          ...(nextAck !== s.acknowledgedAgentsByPaneKey
            ? { acknowledgedAgentsByPaneKey: nextAck }
            : {}),
          ...(needsRetirementWrite
            ? {
                recentlyRetiredAgentStatusPaneKeys: boundRecentlyRetiredAgentStatusPaneKeys(
                  s.recentlyRetiredAgentStatusPaneKeys,
                  [paneKey]
                )
              }
            : {}),
          ...(needsSuppressorWrite
            ? {
                retentionSuppressedPaneKeys: {
                  ...s.retentionSuppressedPaneKeys,
                  [paneKey]: true
                }
              }
            : {}),
          agentStatusEpoch:
            hasLive || migrationUnsupported.changed ? s.agentStatusEpoch + 1 : s.agentStatusEpoch,
          // Why: mirrors removeAgentStatus — dropping a live working/blocked
          // agent changes its contribution to the worktree sort score, so the
          // sidebar smart-sort must recompute. Without this bump, a user-
          // initiated dismissal from the inline agents list would leave the
          // sidebar ordering stale until some unrelated event repaired it.
          sortEpoch: hasLive || migrationUnsupported.changed ? s.sortEpoch + 1 : s.sortEpoch
        }
      })
      // Why: freshness.schedule only matters when the live map changed —
      // retained-only and no-op drops don't touch it. Gate on the live
      // presence observed inside set() so a noop drop on a paneKey with no
      // live and no retained entry (or a retained-only dismissal) skips the
      // microtask.
      if (liveExisted) {
        queueMicrotask(() => scheduleFreshness())
      }
      // Why: propagate the dismissal to the main-process hook cache so the
      // on-disk last-status file evicts this paneKey on the next debounced
      // write. Without this, the main process would re-hydrate the dismissed
      // entry on the next launch and the row would re-appear. Fire-and-forget.
      dropAgentStatusOnHost(paneKey)
    }
  }
}
