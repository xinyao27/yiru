import type { StateCreator } from 'zustand'
import { classifyTitleActivity } from '~renderer/lib/pane-agent-evidence'
import { scheduleRuntimeGraphSync } from '~renderer/runtime/sync-runtime-graph'
import { isDecorativeAgentTitleFrameChange } from '~shared/agent/decorative-title-signature'
import { deriveGeneratedTabTitle } from '~shared/agent/tab-title'

import type { AppState } from '../types'
import { getTabIdFromPaneKey } from './terminal-runtime-model'
import {
  getFallbackTabTitle,
  getTerminalTabOwnerWorktreeId,
  updateUnifiedTerminalLabel,
  updateUnifiedTerminalGeneratedLabel
} from './terminal-tab-model'
import type { TerminalSlice } from './terminals'

export function createTerminalTitleActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<
  TerminalSlice,
  | 'updateTabTitle'
  | 'setGeneratedTabTitleFromAgentPrompt'
  | 'clearTabLaunchAgent'
  | 'setRuntimePaneTitle'
  | 'clearRuntimePaneTitle'
> {
  return {
    updateTabTitle: (tabId, title) => {
      set((s) => {
        // Why: locate the owning worktree and mutate only that entry in
        // tabsByWorktree. Rebuilding every worktree's tab array (even when
        // unchanged) would break shallow-equality checks in unrelated
        // selectors and trigger spurious re-renders across background
        // worktrees on every OSC title frame.
        const ownerWorktreeId = getTerminalTabOwnerWorktreeId(s.tabsByWorktree, tabId)
        if (!ownerWorktreeId) {
          return s
        }
        const tabs = s.tabsByWorktree[ownerWorktreeId] ?? []
        const tabIndex = tabs.findIndex((t) => t.id === tabId)
        const currentTab = tabs[tabIndex]
        if (!currentTab) {
          return s
        }
        const nextTitle = title.trim() || getFallbackTabTitle(currentTab)
        const currentUnifiedTabs = s.unifiedTabsByWorktree[ownerWorktreeId] ?? []
        if (isDecorativeAgentTitleFrameChange(currentTab.title, nextTitle)) {
          const unifiedTabsWithCurrentLabel = updateUnifiedTerminalLabel(
            currentUnifiedTabs,
            tabId,
            currentTab.title
          )
          return unifiedTabsWithCurrentLabel
            ? {
                unifiedTabsByWorktree: {
                  ...s.unifiedTabsByWorktree,
                  [ownerWorktreeId]: unifiedTabsWithCurrentLabel
                }
              }
            : s
        }
        const unifiedTabsWithUpdatedLabel = updateUnifiedTerminalLabel(
          currentUnifiedTabs,
          tabId,
          nextTitle
        )
        if (currentTab.title === nextTitle) {
          return unifiedTabsWithUpdatedLabel
            ? {
                unifiedTabsByWorktree: {
                  ...s.unifiedTabsByWorktree,
                  [ownerWorktreeId]: unifiedTabsWithUpdatedLabel
                }
              }
            : s
        }
        const ownerTabs = tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                // Why: PTYs can briefly emit an empty title while an agent exits.
                // Keep the stable fallback label instead of rendering a blank tab.
                title: nextTitle,
                defaultTitle:
                  tab.defaultTitle ??
                  (/^Terminal \d+$/.test(tab.title) ? tab.title : undefined) ??
                  (/^Terminal \d+$/.test(nextTitle) ? nextTitle : undefined)
              }
            : tab
        )
        scheduleRuntimeGraphSync()
        const nextTabsByWorktree = { ...s.tabsByWorktree, [ownerWorktreeId]: ownerTabs }
        // Agent status is derived from terminal titles and affects sort scoring,
        // so a title change is a meaningful event that should allow re-sort —
        // but only for background worktrees. Title changes in the active
        // worktree are side-effects of PTY reconnection during worktree
        // activation (generation bump → TerminalPane remount → new shell →
        // title update). Bumping sortEpoch here would reorder the sidebar
        // on click — the exact bug PR #209 intended to fix.
        const isActive = ownerWorktreeId === s.activeWorktreeId
        const nextState: Partial<AppState> = isActive
          ? { tabsByWorktree: nextTabsByWorktree }
          : { tabsByWorktree: nextTabsByWorktree, sortEpoch: s.sortEpoch + 1 }
        if (unifiedTabsWithUpdatedLabel) {
          nextState.unifiedTabsByWorktree = {
            ...s.unifiedTabsByWorktree,
            [ownerWorktreeId]: unifiedTabsWithUpdatedLabel
          }
        }
        return nextState
      })
    },
    setGeneratedTabTitleFromAgentPrompt: (paneKey, prompt, options) => {
      // Why: setAgentStatus is high-frequency; skip derive/set unless the feature
      // is on and this tab still needs a (re)generated title.
      if (get().settings?.tabAutoGenerateTitle !== true) {
        return
      }
      const tabId = getTabIdFromPaneKey(paneKey)
      if (!tabId || prompt.length === 0) {
        return
      }
      const ownerWorktreeId = getTerminalTabOwnerWorktreeId(get().tabsByWorktree, tabId)
      if (!ownerWorktreeId) {
        return
      }
      const tabs = get().tabsByWorktree[ownerWorktreeId] ?? []
      const currentTab = tabs.find((tab) => tab.id === tabId)
      if (!currentTab || currentTab.customTitle?.trim() || currentTab.quickCommandLabel?.trim()) {
        return
      }
      const existingGeneratedTitle = currentTab.generatedTitle?.trim()
      if (existingGeneratedTitle && options?.replaceExistingGeneratedTitle !== true) {
        return
      }
      const generatedTitle = deriveGeneratedTabTitle(prompt)
      if (!generatedTitle || existingGeneratedTitle === generatedTitle) {
        return
      }
      set((s) => {
        const ownerTabsForWrite = s.tabsByWorktree[ownerWorktreeId]
        if (!ownerTabsForWrite) {
          return s
        }
        const tabIndex = ownerTabsForWrite.findIndex((tab) => tab.id === tabId)
        const tabForWrite = ownerTabsForWrite[tabIndex]
        // Why: re-check inside set so concurrent renames / setting flips win.
        if (
          !tabForWrite ||
          s.settings?.tabAutoGenerateTitle !== true ||
          tabForWrite.customTitle?.trim() ||
          tabForWrite.quickCommandLabel?.trim()
        ) {
          return s
        }
        const latestGeneratedTitle = tabForWrite.generatedTitle?.trim()
        if (
          latestGeneratedTitle &&
          (latestGeneratedTitle === generatedTitle ||
            options?.replaceExistingGeneratedTitle !== true)
        ) {
          return s
        }
        const ownerTabs = ownerTabsForWrite.map((tab) =>
          tab.id === tabId ? { ...tab, generatedTitle } : tab
        )
        const currentUnifiedTabs = s.unifiedTabsByWorktree[ownerWorktreeId] ?? []
        const unifiedTabsWithGeneratedLabel = updateUnifiedTerminalGeneratedLabel(
          currentUnifiedTabs,
          tabId,
          generatedTitle
        )
        scheduleRuntimeGraphSync()
        return {
          tabsByWorktree: {
            ...s.tabsByWorktree,
            [ownerWorktreeId]: ownerTabs
          },
          ...(unifiedTabsWithGeneratedLabel
            ? {
                unifiedTabsByWorktree: {
                  ...s.unifiedTabsByWorktree,
                  [ownerWorktreeId]: unifiedTabsWithGeneratedLabel
                }
              }
            : {})
        }
      })
    },
    clearTabLaunchAgent: (tabId) => {
      set((s) => {
        const ownerWorktreeId = getTerminalTabOwnerWorktreeId(s.tabsByWorktree, tabId)
        if (!ownerWorktreeId) {
          return s
        }
        const tabs = s.tabsByWorktree[ownerWorktreeId] ?? []
        const tabIndex = tabs.findIndex((t) => t.id === tabId)
        const currentTab = tabs[tabIndex]
        if (!currentTab?.launchAgent) {
          return s
        }
        const { launchAgent: _launchAgent, ...tabWithoutLaunchAgent } = currentTab
        void _launchAgent
        const nextTabs = [...tabs]
        nextTabs[tabIndex] = tabWithoutLaunchAgent
        scheduleRuntimeGraphSync()
        return { tabsByWorktree: { ...s.tabsByWorktree, [ownerWorktreeId]: nextTabs } }
      })
    },
    setRuntimePaneTitle: (tabId, paneId, title) => {
      set((s) => {
        const currentByPane = s.runtimePaneTitlesByTabId[tabId] ?? {}
        const prevTitle = currentByPane[paneId]
        if (prevTitle === title) {
          return s
        }
        if (prevTitle && isDecorativeAgentTitleFrameChange(prevTitle, title)) {
          return s
        }
        // Why: smart sort's title-heuristic fallback (Edge case 9) reads
        // runtimePaneTitlesByTabId. A hookless agent transitioning from
        // 'working' → 'permission' via a title change must trigger a re-sort,
        // otherwise the worktree stays in its old class until some unrelated
        // event fires. Bumping only on classification change keeps incidental
        // title noise (spinner frame, prompt suffix) from churning the sidebar.
        const classificationChanged =
          classifyTitleActivity(prevTitle ?? '') !== classifyTitleActivity(title)
        // Why: locate the owning worktree so we can suppress the sortEpoch
        // bump when the changing pane lives in the active worktree. Title
        // changes there are side-effects of the user's click (PTY remount on
        // worktree activation emits a fresh shell prompt, then the agent
        // re-emits its working title) — bumping would re-rank the sidebar on
        // click, the exact bug PR #209 fixed for updateTabTitle. If no owner
        // is found the pane is orphaned; skip the bump as unsafe.
        const ownerWorktreeId = classificationChanged
          ? getTerminalTabOwnerWorktreeId(s.tabsByWorktree, tabId)
          : null
        const isActive = ownerWorktreeId !== null && ownerWorktreeId === s.activeWorktreeId
        const shouldBump = classificationChanged && ownerWorktreeId !== null && !isActive
        return {
          runtimePaneTitlesByTabId: {
            ...s.runtimePaneTitlesByTabId,
            [tabId]: { ...currentByPane, [paneId]: title }
          },
          ...(shouldBump ? { sortEpoch: s.sortEpoch + 1 } : {})
        }
      })
    },
    clearRuntimePaneTitle: (tabId, paneId) => {
      set((s) => {
        const currentByPane = s.runtimePaneTitlesByTabId[tabId]
        if (!currentByPane || !(paneId in currentByPane)) {
          return s
        }
        const prevTitle = currentByPane[paneId]
        const nextByPane = { ...currentByPane }
        delete nextByPane[paneId]

        const next = { ...s.runtimePaneTitlesByTabId }
        if (Object.keys(nextByPane).length > 0) {
          next[tabId] = nextByPane
        } else {
          delete next[tabId]
        }

        // Why: clearing a 'working'/'permission'-classified title back to none
        // changes the title-heuristic verdict for that pane, so the smart sort
        // needs a re-sort. See setRuntimePaneTitle for the rationale.
        const hadClassification = classifyTitleActivity(prevTitle ?? '') !== null
        // Why: same active-worktree gate as setRuntimePaneTitle — clears that
        // fire as a side-effect of a click-driven PTY teardown in the active
        // worktree must not re-rank the sidebar. Skip bumping when no owner is
        // found (orphaned pane) for the same safety reason.
        const ownerWorktreeId = hadClassification
          ? getTerminalTabOwnerWorktreeId(s.tabsByWorktree, tabId)
          : null
        const isActive = ownerWorktreeId !== null && ownerWorktreeId === s.activeWorktreeId
        const shouldBump = hadClassification && ownerWorktreeId !== null && !isActive
        return {
          runtimePaneTitlesByTabId: next,
          ...(shouldBump ? { sortEpoch: s.sortEpoch + 1 } : {})
        }
      })
    }
  }
}
