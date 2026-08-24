import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import type { AgentStatusSlice } from './agent-status'
import { pruneMigrationUnsupportedEntries } from './agent-status-state-model'

export function createAgentStatusRemovalActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<
  AgentStatusSlice,
  | 'setMigrationUnsupportedPty'
  | 'clearMigrationUnsupportedPty'
  | 'removeAgentStatus'
  | 'removeAgentStatusByTabPrefix'
> {
  return {
    setMigrationUnsupportedPty: (entry) => {
      set((s) => {
        const existing = s.migrationUnsupportedByPtyId[entry.ptyId]
        if (existing && entry.updatedAt < existing.updatedAt) {
          return s
        }
        return {
          migrationUnsupportedByPtyId: {
            ...s.migrationUnsupportedByPtyId,
            [entry.ptyId]: entry
          },
          agentStatusEpoch: s.agentStatusEpoch + 1,
          sortEpoch: s.sortEpoch + 1
        }
      })
    },
    clearMigrationUnsupportedPty: (ptyId) => {
      if (!(ptyId in get().migrationUnsupportedByPtyId)) {
        return
      }
      set((s) => {
        const next = { ...s.migrationUnsupportedByPtyId }
        delete next[ptyId]
        return {
          migrationUnsupportedByPtyId: next,
          agentStatusEpoch: s.agentStatusEpoch + 1,
          sortEpoch: s.sortEpoch + 1
        }
      })
    },
    removeAgentStatus: (paneKey) => {
      if (
        !(paneKey in get().agentStatusByPaneKey) &&
        !(paneKey in get().agentLaunchConfigByPaneKey) &&
        !Object.values(get().migrationUnsupportedByPtyId).some((entry) => entry.paneKey === paneKey)
      ) {
        return
      }
      set((s) => {
        const hasLive = paneKey in s.agentStatusByPaneKey
        const next = hasLive ? { ...s.agentStatusByPaneKey } : s.agentStatusByPaneKey
        if (hasLive) {
          delete next[paneKey]
        }
        const hasLaunchConfig = paneKey in s.agentLaunchConfigByPaneKey
        const nextLaunchConfigs = hasLaunchConfig
          ? { ...s.agentLaunchConfigByPaneKey }
          : s.agentLaunchConfigByPaneKey
        if (hasLaunchConfig) {
          delete nextLaunchConfigs[paneKey]
        }
        const migrationUnsupported = pruneMigrationUnsupportedEntries(
          s.migrationUnsupportedByPtyId,
          (entry) => entry.paneKey === paneKey
        )
        // Why: acknowledgedAgentsByPaneKey is written per user-ack but owned
        // lifecycle-wise by the pane — drop the ack entry in lockstep with the
        // live-map entry so closed panes don't leave stale ack timestamps that
        // could silently suppress "unvisited" signals on future paneKey
        // collisions.
        let nextAck = s.acknowledgedAgentsByPaneKey
        if (paneKey in nextAck) {
          nextAck = { ...nextAck }
          delete nextAck[paneKey]
        }
        // Why: bump sortEpoch in lockstep with agentStatusEpoch — removing an
        // agent can legitimately change worktree sort order, same rationale
        // as setAgentStatus.
        return {
          agentStatusByPaneKey: next,
          agentLaunchConfigByPaneKey: nextLaunchConfigs,
          migrationUnsupportedByPtyId: migrationUnsupported.next,
          ...(nextAck !== s.acknowledgedAgentsByPaneKey
            ? { acknowledgedAgentsByPaneKey: nextAck }
            : {}),
          agentStatusEpoch: s.agentStatusEpoch + 1,
          sortEpoch: s.sortEpoch + 1
        }
      })
      queueMicrotask(() => scheduleFreshness())
    },
    removeAgentStatusByTabPrefix: (tabIdPrefix) => {
      const prefix = `${tabIdPrefix}:`
      const currentKeys = Object.keys(get().agentStatusByPaneKey)
      const toRemove = currentKeys.filter((k) => k.startsWith(prefix))
      const launchConfigKeys = Object.keys(get().agentLaunchConfigByPaneKey).filter((k) =>
        k.startsWith(prefix)
      )
      const hasMigrationUnsupported = Object.values(get().migrationUnsupportedByPtyId).some(
        (entry) => entry.paneKey?.startsWith(prefix)
      )
      if (toRemove.length === 0 && launchConfigKeys.length === 0 && !hasMigrationUnsupported) {
        return
      }
      set((s) => {
        const next = { ...s.agentStatusByPaneKey }
        for (const key of toRemove) {
          delete next[key]
        }
        const nextLaunchConfigs = { ...s.agentLaunchConfigByPaneKey }
        for (const key of launchConfigKeys) {
          delete nextLaunchConfigs[key]
        }
        const migrationUnsupported = pruneMigrationUnsupportedEntries(
          s.migrationUnsupportedByPtyId,
          (entry) => entry.paneKey?.startsWith(prefix) ?? false
        )
        // See removeAgentStatus for rationale on ack cleanup.
        let nextAck = s.acknowledgedAgentsByPaneKey
        const ackKeys = Object.keys(nextAck).filter((k) => k.startsWith(prefix))
        if (ackKeys.length > 0) {
          nextAck = { ...nextAck }
          for (const k of ackKeys) {
            delete nextAck[k]
          }
        }
        // Why: bump sortEpoch in lockstep with agentStatusEpoch — removing
        // agents can legitimately change worktree sort order, same rationale
        // as setAgentStatus. The pre-check guards against spurious bumps when
        // no keys matched the prefix.
        return {
          agentStatusByPaneKey: next,
          agentLaunchConfigByPaneKey: nextLaunchConfigs,
          migrationUnsupportedByPtyId: migrationUnsupported.next,
          ...(nextAck !== s.acknowledgedAgentsByPaneKey
            ? { acknowledgedAgentsByPaneKey: nextAck }
            : {}),
          agentStatusEpoch: s.agentStatusEpoch + 1,
          sortEpoch: s.sortEpoch + 1
        }
      })
      queueMicrotask(() => scheduleFreshness())
    }
  }
}
