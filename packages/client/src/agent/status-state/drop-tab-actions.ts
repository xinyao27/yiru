import type { StateCreator } from 'zustand'
import { dropAgentStatusesByTabPrefixOnHost } from '~renderer/runtime/agent-status-client'

import type { AppState } from '../../store/types'
import { retireAgentPaneAuthorityAliasesByOwnerTab } from '../../terminal-pane/agent/pane-authority'
import { findCompletedOrphanPaneKeysForTabClose } from './retention-model'
import type { AgentStatusSlice } from './slice'
import {
  boundRecentlyClosedAgentStatusTabIds,
  boundRecentlyRetiredAgentStatusPaneKeys,
  pruneMigrationUnsupportedEntries
} from './state-model'

export function createAgentStatusDropTabActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<AgentStatusSlice, 'dropAgentStatusByTabPrefix'> {
  return {
    dropAgentStatusByTabPrefix: (tabIdPrefix, opts) => {
      const prefix = `${tabIdPrefix}:`
      const retiredAliasPaneKeys = retireAgentPaneAuthorityAliasesByOwnerTab(tabIdPrefix)
      let hadLive = false
      set((s) => {
        const completedOrphanKeys = findCompletedOrphanPaneKeysForTabClose(
          s,
          opts?.worktreeId,
          prefix
        )
        const completedOrphanKeySet = new Set(completedOrphanKeys)
        const liveKeys = [
          ...Object.keys(s.agentStatusByPaneKey).filter((k) => k.startsWith(prefix)),
          ...completedOrphanKeys
        ]
        const launchConfigKeys = Object.keys(s.agentLaunchConfigByPaneKey).filter(
          (k) => k.startsWith(prefix) || completedOrphanKeySet.has(k)
        )
        const retainedKeys = Object.keys(s.retainedAgentsByPaneKey).filter(
          (k) => k.startsWith(prefix) || completedOrphanKeySet.has(k)
        )
        const migrationUnsupported = pruneMigrationUnsupportedEntries(
          s.migrationUnsupportedByPtyId,
          (entry) => entry.paneKey?.startsWith(prefix) ?? false
        )
        // See removeAgentStatus for rationale on ack cleanup. Apply this
        // regardless of live/retained presence — ack entries are owned by
        // the pane lifecycle independently of live/retained state.
        let nextAck = s.acknowledgedAgentsByPaneKey
        const ackKeys = Object.keys(nextAck).filter(
          (k) => k.startsWith(prefix) || completedOrphanKeySet.has(k)
        )
        if (ackKeys.length > 0) {
          nextAck = { ...nextAck }
          for (const k of ackKeys) {
            delete nextAck[k]
          }
        }
        const nextClosedTabs = boundRecentlyClosedAgentStatusTabIds(
          s.recentlyClosedAgentStatusTabIds,
          tabIdPrefix
        )
        const nextRetiredPaneKeys = boundRecentlyRetiredAgentStatusPaneKeys(
          s.recentlyRetiredAgentStatusPaneKeys,
          retiredAliasPaneKeys
        )

        if (
          liveKeys.length === 0 &&
          launchConfigKeys.length === 0 &&
          retainedKeys.length === 0 &&
          !migrationUnsupported.changed
        ) {
          if (nextAck !== s.acknowledgedAgentsByPaneKey) {
            return {
              acknowledgedAgentsByPaneKey: nextAck,
              recentlyClosedAgentStatusTabIds: nextClosedTabs,
              recentlyRetiredAgentStatusPaneKeys: nextRetiredPaneKeys
            }
          }
          return {
            recentlyClosedAgentStatusTabIds: nextClosedTabs,
            recentlyRetiredAgentStatusPaneKeys: nextRetiredPaneKeys
          }
        }
        hadLive = liveKeys.length > 0

        const nextLive =
          liveKeys.length > 0 ? { ...s.agentStatusByPaneKey } : s.agentStatusByPaneKey
        for (const key of liveKeys) {
          delete nextLive[key]
        }
        const nextLaunchConfigs =
          launchConfigKeys.length > 0
            ? { ...s.agentLaunchConfigByPaneKey }
            : s.agentLaunchConfigByPaneKey
        for (const key of launchConfigKeys) {
          delete nextLaunchConfigs[key]
        }

        const nextRetained =
          retainedKeys.length > 0 ? { ...s.retainedAgentsByPaneKey } : s.retainedAgentsByPaneKey
        for (const key of retainedKeys) {
          delete nextRetained[key]
        }

        // Why: plant suppressors only for paneKeys that had a live entry,
        // mirroring the hasLive gate in dropAgentStatus — suppressors are
        // one-shot flags consumed by collectRetainedAgentsOnDisappear on a
        // live→gone transition, so a suppressor on a retained-only paneKey
        // would leak because no such transition will ever fire. Also skip
        // keys that are already suppressed so we don't spuriously reallocate
        // the suppressor map for subscribers that select on its identity.
        //
        // Same-frame race: if a hook ping promotes working→done in the same
        // render frame as teardown, the next retention-sync run sees the entry
        // as `done` in prevAgents and surfaces it in retained — even though
        // the user just tore it down. Planting suppressors is the cheap guard
        // for the common ordering; the rare inverse ordering has the same
        // bounded suppressor-leak tradeoff described in dropAgentStatus.
        //
        // Skip completed-orphan keys: their tab is already gone, so retention
        // sync never snapshots them and no live→gone transition ever fires to
        // consume the suppressor — planting one would leak permanently.
        const suppressorAdds = liveKeys.filter(
          (k) => !completedOrphanKeySet.has(k) && !(k in s.retentionSuppressedPaneKeys)
        )
        let nextRetentionSuppressedPaneKeys = s.retentionSuppressedPaneKeys
        if (suppressorAdds.length > 0) {
          nextRetentionSuppressedPaneKeys = { ...s.retentionSuppressedPaneKeys }
          for (const key of suppressorAdds) {
            nextRetentionSuppressedPaneKeys[key] = true
          }
        }

        return {
          agentStatusByPaneKey: nextLive,
          agentLaunchConfigByPaneKey: nextLaunchConfigs,
          retainedAgentsByPaneKey: nextRetained,
          migrationUnsupportedByPtyId: migrationUnsupported.next,
          retentionSuppressedPaneKeys: nextRetentionSuppressedPaneKeys,
          recentlyClosedAgentStatusTabIds: nextClosedTabs,
          recentlyRetiredAgentStatusPaneKeys: nextRetiredPaneKeys,
          ...(nextAck !== s.acknowledgedAgentsByPaneKey
            ? { acknowledgedAgentsByPaneKey: nextAck }
            : {}),
          // Why: mirrors removeAgentStatusByTabPrefix — only bump the live-map
          // epoch / sortEpoch when the live map actually changed. Retained-only
          // sweeps do not participate in smart-sort or freshness calculations.
          agentStatusEpoch:
            hadLive || migrationUnsupported.changed ? s.agentStatusEpoch + 1 : s.agentStatusEpoch,
          sortEpoch: hadLive || migrationUnsupported.changed ? s.sortEpoch + 1 : s.sortEpoch
        }
      })
      if (hadLive) {
        queueMicrotask(() => scheduleFreshness())
      }
      if (typeof window !== 'undefined') {
        dropAgentStatusesByTabPrefixOnHost(tabIdPrefix)
      }
    }
  }
}
