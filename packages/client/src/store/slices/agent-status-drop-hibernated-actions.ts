import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import type { RetainedAgentEntry, AgentStatusSlice } from './agent-status'
import {
  retainedAgentEntryFromLive,
  shouldReplaceRetainedWithLive
} from './agent-status-retention-model'
import { pruneMigrationUnsupportedEntries } from './agent-status-state-model'

export function createAgentStatusDropHibernatedActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<AgentStatusSlice, 'dropHibernatedAgentStatusPane'> {
  return {
    dropHibernatedAgentStatusPane: (worktreeId, paneKey, opts) => {
      let hadLive = false
      set((s) => {
        const liveEntry = s.agentStatusByPaneKey[paneKey]
        const hasLive = liveEntry !== undefined
        const hasRetained = paneKey in s.retainedAgentsByPaneKey
        const hasLaunchConfig = paneKey in s.agentLaunchConfigByPaneKey
        const migrationUnsupported = pruneMigrationUnsupportedEntries(
          s.migrationUnsupportedByPtyId,
          (entry) => entry.paneKey === paneKey
        )
        const retainedEvidence = new Map<string, RetainedAgentEntry>()
        for (const retained of opts?.retainedCompletionEvidence ?? []) {
          if (
            retained.entry.paneKey === paneKey &&
            !liveEntry &&
            shouldReplaceRetainedWithLive(retainedEvidence.get(paneKey), retained)
          ) {
            retainedEvidence.set(paneKey, retained)
          }
        }
        if (
          liveEntry?.state === 'done' &&
          liveEntry.agentType !== undefined &&
          liveEntry.interrupted !== true
        ) {
          retainedEvidence.set(
            paneKey,
            retainedAgentEntryFromLive(s, worktreeId, liveEntry, liveEntry.agentType)
          )
        }
        const keepsCompletionEvidence = retainedEvidence.has(paneKey)
        let nextAck = s.acknowledgedAgentsByPaneKey
        if (!keepsCompletionEvidence && paneKey in nextAck) {
          nextAck = { ...nextAck }
          delete nextAck[paneKey]
        }
        if (
          !hasLive &&
          !hasRetained &&
          !hasLaunchConfig &&
          !migrationUnsupported.changed &&
          !keepsCompletionEvidence
        ) {
          if (nextAck !== s.acknowledgedAgentsByPaneKey) {
            return { acknowledgedAgentsByPaneKey: nextAck }
          }
          return s
        }
        hadLive = hasLive

        const nextLive = hasLive ? { ...s.agentStatusByPaneKey } : s.agentStatusByPaneKey
        if (hasLive) {
          delete nextLive[paneKey]
        }
        const nextLaunchConfigs = hasLaunchConfig
          ? { ...s.agentLaunchConfigByPaneKey }
          : s.agentLaunchConfigByPaneKey
        if (hasLaunchConfig) {
          delete nextLaunchConfigs[paneKey]
        }

        const nextRetained =
          hasRetained || keepsCompletionEvidence
            ? { ...s.retainedAgentsByPaneKey }
            : s.retainedAgentsByPaneKey
        if (hasRetained && !keepsCompletionEvidence) {
          delete nextRetained[paneKey]
        }
        for (const [key, retained] of retainedEvidence) {
          if (shouldReplaceRetainedWithLive(nextRetained[key], retained)) {
            nextRetained[key] = retained
          }
        }

        const needsSuppressor =
          hasLive && !keepsCompletionEvidence && !(paneKey in s.retentionSuppressedPaneKeys)

        return {
          agentStatusByPaneKey: nextLive,
          agentLaunchConfigByPaneKey: nextLaunchConfigs,
          retainedAgentsByPaneKey: nextRetained,
          migrationUnsupportedByPtyId: migrationUnsupported.next,
          ...(nextAck !== s.acknowledgedAgentsByPaneKey
            ? { acknowledgedAgentsByPaneKey: nextAck }
            : {}),
          ...(needsSuppressor
            ? {
                retentionSuppressedPaneKeys: {
                  ...s.retentionSuppressedPaneKeys,
                  [paneKey]: true
                }
              }
            : {}),
          agentStatusEpoch:
            hasLive || migrationUnsupported.changed ? s.agentStatusEpoch + 1 : s.agentStatusEpoch,
          sortEpoch: hasLive || migrationUnsupported.changed ? s.sortEpoch + 1 : s.sortEpoch
        }
      })
      if (hadLive) {
        queueMicrotask(() => scheduleFreshness())
      }
    }
  }
}
