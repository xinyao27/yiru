import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { closeRuntimeTerminal } from '~renderer/runtime/terminal-inspection'
import { shutdownBufferCaptures } from '~renderer/runtime/terminal-shutdown-buffer-captures'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import { parsePaneKey } from '~shared/stable-pane-id'

import type { AppState } from '../types'
import {
  collectHibernatedCompletionEvidenceForWorktree,
  collectSleepingAgentSessionRecordsForWorktree
} from './agent-status'
import {
  resolveTerminalStopRuntimeEnvironmentId,
  sortedUniquePtyIds,
  equalStringSets
} from './terminal-runtime-model'
import { isRuntimeTerminalPtyId } from './terminal-tab-model'
import type { TerminalSlice } from './terminals'

export function createTerminalHibernateActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'shutdownCompletedAgentPaneForHibernation'> {
  return {
    shutdownCompletedAgentPaneForHibernation: async (worktreeId, opts) => {
      const paneKeys = [opts.paneKey]
      const expectedRuntimePtyIds = sortedUniquePtyIds(
        opts.expectedRuntimePtyId ? [opts.expectedRuntimePtyId] : []
      )
      const rendererShutdownPtyIds = [opts.ptyId]
      const state = get()
      const runtimeEnvironmentId = resolveTerminalStopRuntimeEnvironmentId(state, worktreeId)
      // Why: pane transports emit renderer PTY ids, never raw exact-stop handles.
      // Guard only the identity that can actually deliver an exit callback.
      const exitGuardPtyIds = [opts.ptyId]
      const tab = (state.tabsByWorktree[worktreeId] ?? []).find(
        (candidate) => candidate.id === opts.tabId
      )
      const parsed = parsePaneKey(opts.paneKey)
      const layout = state.terminalLayoutsByTabId[opts.tabId]
      const liveTabPtyIds = state.ptyIdsByTabId[opts.tabId] ?? []
      if (
        !tab ||
        !parsed ||
        parsed.tabId !== opts.tabId ||
        parsed.leafId !== opts.leafId ||
        layout?.ptyIdsByLeafId?.[opts.leafId] !== opts.ptyId ||
        (expectedRuntimePtyIds.length === 0 && !liveTabPtyIds.includes(opts.ptyId))
      ) {
        throw new Error('agent_hibernation_pane_binding_mismatch')
      }

      const sleepingAgentSessionRecords = collectSleepingAgentSessionRecordsForWorktree(
        state,
        worktreeId,
        {
          paneKeys,
          captureMode: 'completed-agent-hibernation'
        }
      )
      const retainedCompletionEvidence = collectHibernatedCompletionEvidenceForWorktree(
        state,
        worktreeId,
        paneKeys
      )
      if (!sleepingAgentSessionRecords[opts.paneKey]) {
        // Why: killing the PTY without a persisted resume record strands the
        // pane — nothing can ever wake it. Planner eligibility can go stale
        // between ticks; abort this round instead of hibernating unrecoverably.
        throw new Error('agent_hibernation_capture_missing')
      }

      const capture = shutdownBufferCaptures.get(opts.tabId)
      if (capture) {
        try {
          capture({ includeLocalBuffers: false })
        } catch {
          // Don't let one tab's capture failure block the pane hibernation.
        }
      }

      // Why: the pane's exit handler consults sleepingAgentSessionsByPaneKey to
      // tell a hibernation kill from other suppressed exits. pty:exit can reach
      // the renderer before the kill promise resolves, so the record must be in
      // the store BEFORE the kill is issued — and rolled back if the kill fails.
      const sleepingRecordKeys = Object.keys(sleepingAgentSessionRecords)
      const replacedSleepingRecords: Record<string, (typeof sleepingAgentSessionRecords)[string]> =
        {}
      for (const key of sleepingRecordKeys) {
        const existing = state.sleepingAgentSessionsByPaneKey[key]
        if (existing) {
          replacedSleepingRecords[key] = existing
        }
      }

      const rollbackTargetShutdownState = (): void => {
        set((s) => {
          const next = { ...s.suppressedPtyExitIds }
          for (const ptyId of exitGuardPtyIds) {
            delete next[ptyId]
          }
          const nextSleeping = { ...s.sleepingAgentSessionsByPaneKey }
          for (const key of sleepingRecordKeys) {
            const replaced = replacedSleepingRecords[key]
            if (replaced) {
              nextSleeping[key] = replaced
            } else {
              delete nextSleeping[key]
            }
          }
          return { suppressedPtyExitIds: next, sleepingAgentSessionsByPaneKey: nextSleeping }
        })
      }

      set((s) => ({
        suppressedPtyExitIds: {
          ...s.suppressedPtyExitIds,
          ...Object.fromEntries(exitGuardPtyIds.map((ptyId) => [ptyId, true] as const))
        },
        sleepingAgentSessionsByPaneKey: {
          ...s.sleepingAgentSessionsByPaneKey,
          ...sleepingAgentSessionRecords
        }
      }))

      if (expectedRuntimePtyIds.length > 0) {
        if (!runtimeEnvironmentId) {
          rollbackTargetShutdownState()
          throw new Error('missing_runtime_for_exact_terminal_stop')
        }
        let stopResult: {
          stoppedPtyIds?: string[]
          livePtyIds?: string[]
          postStopVerified?: boolean
          postStopFailure?: string
        }
        try {
          stopResult = await callRuntimeOrpc(
            { kind: 'environment', environmentId: runtimeEnvironmentId },
            (client) => client.terminal.stopExact,
            {
              worktree: toRuntimeWorktreeSelector(worktreeId),
              expectedPtyIds: expectedRuntimePtyIds,
              keepHistory: true,
              targetOnly: true
            },
            { timeoutMs: 15_000 }
          )
        } catch (err) {
          rollbackTargetShutdownState()
          throw err
        }
        const stoppedPtyIds = sortedUniquePtyIds(stopResult.stoppedPtyIds)
        const livePtyIds = sortedUniquePtyIds(stopResult.livePtyIds)
        const targetWasLive = expectedRuntimePtyIds.every((ptyId) => livePtyIds.includes(ptyId))
        if (!equalStringSets(stoppedPtyIds, expectedRuntimePtyIds) || !targetWasLive) {
          rollbackTargetShutdownState()
          throw new Error('exact_terminal_stop_mismatch')
        }
        if (stopResult.postStopVerified !== true) {
          rollbackTargetShutdownState()
          throw new Error(stopResult.postStopFailure ?? 'exact_terminal_stop_unverified')
        }
      } else if (!isRuntimeTerminalPtyId(opts.ptyId)) {
        try {
          await closeRuntimeTerminal(opts.ptyId)
        } catch (err) {
          rollbackTargetShutdownState()
          throw err
        }
      }

      set((s) => {
        const existingPtyIds = s.ptyIdsByTabId[opts.tabId] ?? []
        const shutdownPtyIdSet = new Set(rendererShutdownPtyIds)
        const remainingPtyIds = existingPtyIds.filter((ptyId) => !shutdownPtyIdSet.has(ptyId))
        const nextTabsByWorktree = { ...s.tabsByWorktree }
        const tabs = nextTabsByWorktree[worktreeId] ?? []
        const tabIndex = tabs.findIndex((candidate) => candidate.id === opts.tabId)
        if (tabIndex !== -1) {
          const nextTabs = [...tabs]
          nextTabs[tabIndex] = {
            ...nextTabs[tabIndex],
            ptyId: remainingPtyIds.at(-1) ?? null
          }
          nextTabsByWorktree[worktreeId] = nextTabs
        }

        const nextCodexRestartNoticeByPtyId = { ...s.codexRestartNoticeByPtyId }
        for (const ptyId of exitGuardPtyIds) {
          delete nextCodexRestartNoticeByPtyId[ptyId]
        }
        const nextLastKnownRelay =
          remainingPtyIds.length === 0
            ? { ...s.lastKnownRelayPtyIdByTabId }
            : s.lastKnownRelayPtyIdByTabId
        if (remainingPtyIds.length === 0) {
          delete nextLastKnownRelay[opts.tabId]
        }

        let nextRuntimePaneTitlesByTabId = s.runtimePaneTitlesByTabId
        const numericPaneId = Number(opts.leafId)
        if (
          Number.isInteger(numericPaneId) &&
          s.runtimePaneTitlesByTabId[opts.tabId]?.[numericPaneId]
        ) {
          const nextByPane = { ...s.runtimePaneTitlesByTabId[opts.tabId] }
          delete nextByPane[numericPaneId]
          nextRuntimePaneTitlesByTabId = { ...s.runtimePaneTitlesByTabId }
          if (Object.keys(nextByPane).length > 0) {
            nextRuntimePaneTitlesByTabId[opts.tabId] = nextByPane
          } else {
            delete nextRuntimePaneTitlesByTabId[opts.tabId]
          }
        }

        const nextUnreadTerminalPanes = { ...s.unreadTerminalPanes }
        const nextUnreadAgentCompletionPanes = { ...s.unreadAgentCompletionPanes }
        const nextLastTerminalInputAtByPaneKey = { ...s.lastTerminalInputAtByPaneKey }
        delete nextUnreadTerminalPanes[opts.paneKey]
        delete nextUnreadAgentCompletionPanes[opts.paneKey]
        delete nextLastTerminalInputAtByPaneKey[opts.paneKey]

        return {
          tabsByWorktree: nextTabsByWorktree,
          ptyIdsByTabId: {
            ...s.ptyIdsByTabId,
            [opts.tabId]: remainingPtyIds
          },
          lastKnownRelayPtyIdByTabId: nextLastKnownRelay,
          suppressedPtyExitIds: {
            ...s.suppressedPtyExitIds,
            ...Object.fromEntries(exitGuardPtyIds.map((ptyId) => [ptyId, true] as const))
          },
          codexRestartNoticeByPtyId: nextCodexRestartNoticeByPtyId,
          ...(nextRuntimePaneTitlesByTabId !== s.runtimePaneTitlesByTabId
            ? { runtimePaneTitlesByTabId: nextRuntimePaneTitlesByTabId }
            : {}),
          unreadTerminalPanes: nextUnreadTerminalPanes,
          unreadAgentCompletionPanes: nextUnreadAgentCompletionPanes,
          lastTerminalInputAtByPaneKey: nextLastTerminalInputAtByPaneKey
        }
      })

      get().dropHibernatedAgentStatusPane(worktreeId, opts.paneKey, {
        retainedCompletionEvidence
      })
    }
  }
}
