import type { StateCreator } from 'zustand'
import { forgetAgentHibernationTabOutput } from '~renderer/components/terminal-pane/agent/hibernation-output-activity'
import { forgetAgentStartupDeliveriesForTabs } from '~renderer/components/terminal-pane/agent/startup-delivery-guards'
import { forgetForegroundTerminalTabs } from '~renderer/lib/foreground-terminal-tabs'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { closeRuntimeTerminal } from '~renderer/runtime/terminal-inspection'
import { retireParkedTerminalTab } from '~renderer/runtime/terminal-parked-watcher-registry'
import type { TerminalTab } from '~shared/types'

import type { AppState } from '../types'
import { pushClosedTerminalTabSnapshot, pushRecentlyClosedTabKind } from './recently-closed-tabs'
import {
  buildTerminalTabRetirementPlan,
  removeSleepingAgentSessionsForTab
} from './terminal-tab-retirement'
import type { TerminalSlice } from './terminals'

export function createTerminalCloseActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'closeTab'> {
  return {
    closeTab: (tabId, opts) => {
      const closeReason = opts?.reason ?? 'user'
      const retiresSession = closeReason === 'user' || closeReason === 'cleanup'
      const retirementPlan =
        opts?.precomputedRetirementPlan?.tabId === tabId
          ? opts.precomputedRetirementPlan
          : buildTerminalTabRetirementPlan(get(), tabId)
      let closingWorktreeId: string | null = null

      // Why: a parked tab has no mounted TerminalPane cleanup. Retirement must
      // synchronously revoke its observer/candidate state before provider exit races.
      retireParkedTerminalTab(tabId)
      if (retiresSession) {
        const fallbackRuntimeEnvironmentId = retirementPlan.worktreeId
          ? getRuntimeEnvironmentIdForWorktree(get(), retirementPlan.worktreeId)
          : null
        const retirementTasks: Promise<unknown>[] = opts?.localPtyTeardownOwnedExternally
          ? []
          : retirementPlan.localOrSshPtyIds.map(closeRuntimeTerminal)
        const localOrSshTaskCount = retirementTasks.length
        if (!opts?.remoteCloseOwnedByHost) {
          for (const terminal of retirementPlan.runtimeTerminals) {
            const environmentId = terminal.environmentId ?? fallbackRuntimeEnvironmentId
            retirementTasks.push(
              callRuntimeOrpc(
                environmentId ? { kind: 'environment', environmentId } : { kind: 'local' },
                (client) => client.terminal.close,
                { terminal: terminal.handle }
              )
            )
          }
        }
        if (retirementPlan.unroutablePtyIds.length > 0) {
          console.warn('[terminal-retirement] skipped unroutable runtime handles', {
            tabId,
            count: retirementPlan.unroutablePtyIds.length
          })
        }
        // Why: close remains synchronous and idempotent; provider failures must
        // not reject into the UI or prevent renderer ownership from being revoked.
        void Promise.allSettled(retirementTasks).then((results) => {
          const localOrSshFailures = results
            .slice(0, localOrSshTaskCount)
            .filter((result) => result.status === 'rejected').length
          const runtimeFailures = results
            .slice(localOrSshTaskCount)
            .filter((result) => result.status === 'rejected').length
          if (localOrSshFailures > 0 || runtimeFailures > 0) {
            console.warn('[terminal-retirement] provider teardown failed', {
              tabId,
              localOrSshFailures,
              runtimeFailures
            })
          }
        })
      }

      set((s) => {
        const next = { ...s.tabsByWorktree }
        let closedTab: TerminalTab | null = null
        let closedWorktreeId: string | null = null
        for (const wId of Object.keys(next)) {
          const before = next[wId]
          const closing = before.find((t) => t.id === tabId)
          if (closing) {
            closingWorktreeId = wId
            // Why: capture the first-matched tab's snapshot for the Cmd+Shift+T
            // reopen stack (see capturedSnapshot below).
            if (!closedTab) {
              closedTab = closing
              closedWorktreeId = wId
            }
          }
          const after = before.filter((t) => t.id !== tabId)
          if (after.length !== before.length) {
            next[wId] = after
          }
        }
        // Why: only explicit user closes feed the Cmd+Shift+T reopen stack.
        // Cleanup and PTY-exit closes must not pollute user undo history.
        const capturedSnapshot =
          closeReason === 'user' &&
          opts?.captureRecentlyClosed !== false &&
          closedTab &&
          closedWorktreeId
            ? {
                ...(closedTab.startupCwd ? { startupCwd: closedTab.startupCwd } : {}),
                ...(closedTab.shellOverride ? { shellOverride: closedTab.shellOverride } : {}),
                ...(closedTab.customTitle ? { customTitle: closedTab.customTitle } : {}),
                ...(closedTab.color ? { color: closedTab.color } : {})
              }
            : null
        const nextExpanded = { ...s.expandedPaneByTabId }
        delete nextExpanded[tabId]
        const nextCanExpand = { ...s.canExpandPaneByTabId }
        delete nextCanExpand[tabId]
        const nextLayouts = { ...s.terminalLayoutsByTabId }
        delete nextLayouts[tabId]
        const nextPtyIdsByTabId = { ...s.ptyIdsByTabId }
        delete nextPtyIdsByTabId[tabId]
        const nextLastKnownRelay = { ...s.lastKnownRelayPtyIdByTabId }
        delete nextLastKnownRelay[tabId]
        const nextPendingReconnectPtyIdByTabId = { ...s.pendingReconnectPtyIdByTabId }
        delete nextPendingReconnectPtyIdByTabId[tabId]
        const nextRuntimePaneTitlesByTabId = { ...s.runtimePaneTitlesByTabId }
        delete nextRuntimePaneTitlesByTabId[tabId]
        // Why: preserve the unreadTerminalTabs reference when the closing tab had
        // no unread flag — avoids a no-op top-level state allocation that would
        // force re-evaluation of full-state selectors on unrelated closeTab calls.
        // Mirrors the sibling pattern in tabs.ts (focusGroup, reconcileWorktreeTabModel).
        let nextUnreadTerminalTabs = s.unreadTerminalTabs
        if (s.unreadTerminalTabs[tabId]) {
          nextUnreadTerminalTabs = { ...s.unreadTerminalTabs }
          delete nextUnreadTerminalTabs[tabId]
        }
        let nextUnreadTerminalPanes = s.unreadTerminalPanes
        for (const paneKey of Object.keys(s.unreadTerminalPanes)) {
          if (paneKey.startsWith(`${tabId}:`)) {
            if (nextUnreadTerminalPanes === s.unreadTerminalPanes) {
              nextUnreadTerminalPanes = { ...s.unreadTerminalPanes }
            }
            delete nextUnreadTerminalPanes[paneKey]
          }
        }
        let nextUnreadAgentCompletionPanes = s.unreadAgentCompletionPanes
        for (const paneKey of Object.keys(s.unreadAgentCompletionPanes)) {
          if (paneKey.startsWith(`${tabId}:`)) {
            if (nextUnreadAgentCompletionPanes === s.unreadAgentCompletionPanes) {
              nextUnreadAgentCompletionPanes = { ...s.unreadAgentCompletionPanes }
            }
            delete nextUnreadAgentCompletionPanes[paneKey]
          }
        }
        const nextLastTerminalInputAtByPaneKey = { ...s.lastTerminalInputAtByPaneKey }
        for (const paneKey of Object.keys(nextLastTerminalInputAtByPaneKey)) {
          if (paneKey.startsWith(`${tabId}:`)) {
            delete nextLastTerminalInputAtByPaneKey[paneKey]
          }
        }
        const nextSleepingAgentSessionsByPaneKey = retiresSession
          ? removeSleepingAgentSessionsForTab(s.sleepingAgentSessionsByPaneKey, tabId)
          : s.sleepingAgentSessionsByPaneKey
        const nextPendingStartupByTabId = { ...s.pendingStartupByTabId }
        delete nextPendingStartupByTabId[tabId]
        const nextAutomaticAgentResumeClaimsByTabId = { ...s.automaticAgentResumeClaimsByTabId }
        delete nextAutomaticAgentResumeClaimsByTabId[tabId]
        const nextPendingInitialCwdByTabId = { ...s.pendingInitialCwdByTabId }
        delete nextPendingInitialCwdByTabId[tabId]
        const nextPendingSetupSplitByTabId = { ...s.pendingSetupSplitByTabId }
        delete nextPendingSetupSplitByTabId[tabId]
        const nextCacheTimer = { ...s.cacheTimerByKey }
        // Why: cache timer keys are `${tabId}:${leafId}` composites. Remove all
        // entries for the closing tab, regardless of how many panes it had.
        for (const key of Object.keys(nextCacheTimer)) {
          if (key.startsWith(`${tabId}:`)) {
            delete nextCacheTimer[key]
          }
        }
        // Why: keep activeTabIdByWorktree in sync when a tab is closed in a
        // background worktree. Without this, the remembered tab becomes stale
        // and restoring it on worktree switch falls back to tabs[0].
        const nextActiveTabIdByWorktree = { ...s.activeTabIdByWorktree }
        for (const [wId, tabs] of Object.entries(next)) {
          if (nextActiveTabIdByWorktree[wId] === tabId) {
            nextActiveTabIdByWorktree[wId] = tabs[0]?.id ?? null
          }
        }

        // Why: keep tabBarOrderByWorktree in sync so stale terminal IDs don't
        // linger and cause position shifts on subsequent tab operations.
        const nextTabBarOrderByWorktree: Record<string, string[]> = {
          ...s.tabBarOrderByWorktree
        }
        for (const wId of Object.keys(nextTabBarOrderByWorktree)) {
          const order = nextTabBarOrderByWorktree[wId]
          if (order?.includes(tabId)) {
            nextTabBarOrderByWorktree[wId] = order.filter((entryId) => entryId !== tabId)
          }
        }

        // Why: if the tab had a ptyId with unconsumed snapshot or cold restore
        // data (e.g., tab closed before TerminalPane mounted), clean it up to
        // prevent unbounded store growth across restarts.
        let nextSnapshots = s.pendingSnapshotByPtyId
        let nextColdRestores = s.pendingColdRestoreByPtyId
        const closingPtyIds = new Set([
          ...retirementPlan.localOrSshPtyIds,
          ...retirementPlan.runtimeTerminals.map((terminal) => terminal.ptyId),
          ...retirementPlan.cleanupOnlyPtyIds,
          ...retirementPlan.unroutablePtyIds
        ])
        for (const closingId of closingPtyIds) {
          if (closingId in nextSnapshots) {
            nextSnapshots = { ...nextSnapshots }
            delete nextSnapshots[closingId]
          }
          if (closingId in nextColdRestores) {
            nextColdRestores = { ...nextColdRestores }
            delete nextColdRestores[closingId]
          }
        }

        return {
          tabsByWorktree: next,
          activeTabId: s.activeTabId === tabId ? null : s.activeTabId,
          activeTabIdByWorktree: nextActiveTabIdByWorktree,
          ptyIdsByTabId: nextPtyIdsByTabId,
          lastKnownRelayPtyIdByTabId: nextLastKnownRelay,
          pendingReconnectPtyIdByTabId: nextPendingReconnectPtyIdByTabId,
          runtimePaneTitlesByTabId: nextRuntimePaneTitlesByTabId,
          ...(nextSleepingAgentSessionsByPaneKey !== s.sleepingAgentSessionsByPaneKey
            ? { sleepingAgentSessionsByPaneKey: nextSleepingAgentSessionsByPaneKey }
            : {}),
          // Why: skip writing unreadTerminalTabs when the reference is unchanged —
          // avoids a no-op top-level state allocation that would force re-evaluation
          // of full-state selectors. Mirrors the sibling pattern in tabs.ts.
          ...(nextUnreadTerminalTabs !== s.unreadTerminalTabs
            ? { unreadTerminalTabs: nextUnreadTerminalTabs }
            : {}),
          ...(nextUnreadTerminalPanes !== s.unreadTerminalPanes
            ? { unreadTerminalPanes: nextUnreadTerminalPanes }
            : {}),
          ...(nextUnreadAgentCompletionPanes !== s.unreadAgentCompletionPanes
            ? { unreadAgentCompletionPanes: nextUnreadAgentCompletionPanes }
            : {}),
          lastTerminalInputAtByPaneKey: nextLastTerminalInputAtByPaneKey,
          expandedPaneByTabId: nextExpanded,
          canExpandPaneByTabId: nextCanExpand,
          terminalLayoutsByTabId: nextLayouts,
          pendingStartupByTabId: nextPendingStartupByTabId,
          automaticAgentResumeClaimsByTabId: nextAutomaticAgentResumeClaimsByTabId,
          pendingInitialCwdByTabId: nextPendingInitialCwdByTabId,
          pendingSetupSplitByTabId: nextPendingSetupSplitByTabId,
          cacheTimerByKey: nextCacheTimer,
          tabBarOrderByWorktree: nextTabBarOrderByWorktree,
          pendingSnapshotByPtyId: nextSnapshots,
          pendingColdRestoreByPtyId: nextColdRestores,
          ...(capturedSnapshot && closedWorktreeId
            ? {
                recentlyClosedTerminalTabsByWorktree: pushClosedTerminalTabSnapshot(
                  s.recentlyClosedTerminalTabsByWorktree,
                  closedWorktreeId,
                  capturedSnapshot
                ),
                recentlyClosedTabKindsByWorktree: pushRecentlyClosedTabKind(
                  s.recentlyClosedTabKindsByWorktree,
                  closedWorktreeId,
                  'terminal'
                )
              }
            : {})
        }
      })
      // Why: sweep live AND retained agent-status entries for this tab — closing
      // the tab is the user telling us "I'm done with this session", so any
      // completion snapshots it left behind (in the inline agents list) must go
      // too. Use dropAgentStatusByTabPrefix (not removeAgentStatusByTabPrefix)
      // so retention suppressors are planted: a live→gone transition inside the
      // same frame as the tab close cannot re-snapshot a row we just dropped.
      // Why: Pi can leave a completed row attributed to the worktree but keyed
      // under an already-missing tab id; pass the worktree to sweep only that
      // completed orphan while preserving active pre-render child rows.
      get().dropAgentStatusByTabPrefix(
        tabId,
        closingWorktreeId ? { worktreeId: closingWorktreeId } : undefined
      )
      // Why: retired pane keys never recur, so stranded foreground entries would
      // accumulate for the renderer's whole lifetime.
      get().clearPaneForegroundAgentByTabPrefix(tabId)
      // Why: closing a tab permanently retires every pane under it (a reopen mints
      // a fresh leafId at epoch 0), so drop the panes' hibernation output epochs to
      // keep that module-level map from growing for the renderer's whole lifetime.
      forgetAgentHibernationTabOutput(tabId)
      // Why: same rationale for the tab's foreground last-seen timestamp and any
      // consumed agent-startup delivery guards — retired tab ids never recur.
      forgetForegroundTerminalTabs([tabId])
      forgetAgentStartupDeliveriesForTabs([tabId])
      for (const tabs of Object.values(get().unifiedTabsByWorktree)) {
        const workspaceItem = tabs.find(
          (entry) => entry.contentType === 'terminal' && entry.entityId === tabId
        )
        if (workspaceItem) {
          get().closeUnifiedTab(workspaceItem.id, {
            recordInteraction: opts?.recordInteraction,
            terminalRetirementHandled: true
          })
        }
      }
    }
  }
}
