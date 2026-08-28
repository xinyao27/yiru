import { openMobileEmulatorTab } from '~renderer/emulator-pane/open-tab'
import {
  isManualSimulatorLaunchPending,
  rememberPrelaunchedSimulatorSession
} from '~renderer/emulator-pane/simulator-launch-coordination'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { subscribeEmulatorEvents } from '~renderer/runtime/emulator-events-client'
import { shellClient } from '~renderer/runtime/shell-client'
import {
  closeWebRuntimeSessionTab,
  createWebRuntimeSessionTerminal,
  isWebRuntimeSessionActive
} from '~renderer/runtime/web-runtime-session'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import {
  handleSwitchRecentTab,
  handleSwitchTab,
  handleSwitchTabAcrossAllTypes,
  handleSwitchTerminalTab
} from '~renderer/tab-bar/ipc-tab-switch'
import { ensureSimulatorTab } from '~renderer/tab-group/ensure-simulator-tab'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { guardPinnedTabClose, resolvePinnedTabLabel } from '../../tab-bar/state/pinned-close-guard'
import { isRuntimeEnvironmentActive } from './runtime-projects'

function isPinnedSessionTab(store: AppState, worktreeId: string, visibleId: string): boolean {
  return (store.unifiedTabsByWorktree?.[worktreeId] ?? []).some(
    (tab) => (tab.id === visibleId || tab.entityId === visibleId) && tab.isPinned
  )
}

function runtimeEnvironmentId(worktreeId: string | null | undefined): string | null {
  return getRuntimeEnvironmentIdForWorktree(readProjectCatalogRuntimeState(), worktreeId)
}

function createTerminalTab(): void {
  const store = useAppStore.getState()
  const worktreeId = store.activeWorktreeId
  if (!worktreeId) {
    return
  }
  void (async () => {
    if (
      await createWebRuntimeSessionTerminal({
        worktreeId,
        environmentId: runtimeEnvironmentId(worktreeId),
        activate: true
      })
    ) {
      return
    }
    const newTab = store.createTab(worktreeId)
    store.setActiveTabType('terminal')
    const current = useAppStore.getState()
    const terminalIds = (current.tabsByWorktree[worktreeId] ?? []).map((tab) => tab.id)
    const editorIds = current.openFiles
      .filter((file) => file.worktreeId === worktreeId)
      .map((file) => file.id)
    const browserIds = (current.browserTabsByWorktree[worktreeId] ?? []).map((tab) => tab.id)
    const validIds = new Set([...terminalIds, ...editorIds, ...browserIds])
    const order = (current.tabBarOrderByWorktree[worktreeId] ?? []).filter((id) => validIds.has(id))
    const known = new Set(order)
    for (const id of [...terminalIds, ...editorIds, ...browserIds]) {
      if (!known.has(id)) {
        order.push(id)
        known.add(id)
      }
    }
    current.setTabBarOrder(worktreeId, [...order.filter((id) => id !== newTab.id), newTab.id])
    focusTerminalTabSurface(newTab.id)
  })()
}

function closeActiveBrowserTab(): void {
  const store = useAppStore.getState()
  if (store.activeTabType !== 'browser' || !store.activeBrowserTabId) {
    return
  }
  const tabId = store.activeBrowserTabId
  const worktreeId = store.activeWorktreeId
  const close = (): void => {
    const current = useAppStore.getState()
    const environmentId = runtimeEnvironmentId(worktreeId)
    if (environmentId && worktreeId && isWebRuntimeSessionActive(environmentId)) {
      void closeWebRuntimeSessionTab({ worktreeId, tabId, environmentId })
    } else {
      current.closeBrowserTab(tabId)
    }
  }
  if (worktreeId && isPinnedSessionTab(store, worktreeId, tabId)) {
    guardPinnedTabClose({
      isPinned: true,
      tabLabel: resolvePinnedTabLabel(store, worktreeId, tabId),
      onClose: close
    })
  } else {
    close()
  }
}

export function subscribeShellTabEvents(): () => void {
  const unsubs = [
    shellClient.ui.onNewBrowserTab(() => {
      const store = useAppStore.getState()
      const worktreeId = store.activeWorktreeId
      if (!worktreeId) {
        return
      }
      const groupId =
        store.activeGroupIdByWorktree[worktreeId] ?? store.groupsByWorktree[worktreeId]?.[0]?.id
      if (groupId) {
        void store.openNewBrowserTabInActiveWorkspace(groupId)
      }
    }),
    shellClient.ui.onNewMarkdownTab(() => {
      const store = useAppStore.getState()
      const worktreeId = store.activeWorktreeId
      if (!worktreeId) {
        return
      }
      const groupId =
        store.activeGroupIdByWorktree[worktreeId] ?? store.groupsByWorktree[worktreeId]?.[0]?.id
      if (groupId) {
        void store.openNewMarkdownInActiveWorkspace(groupId)
      }
    }),
    subscribeEmulatorEvents({
      onAutoAttach: ({ worktreeId, info }) => {
        if (isManualSimulatorLaunchPending(worktreeId)) {
          rememberPrelaunchedSimulatorSession(worktreeId, info)
          return
        }
        ensureSimulatorTab(worktreeId, { surfacePane: false })
        window.setTimeout(
          () =>
            window.dispatchEvent(
              new CustomEvent('yiru:emulator-auto-attach', { detail: { worktreeId, info } })
            ),
          0
        )
      },
      onPaneFocus: ({ worktreeId }) => ensureSimulatorTab(worktreeId, { surfacePane: true })
    }),
    shellClient.ui.onNewTerminalTab(createTerminalTab),
    shellClient.ui.onCloseActiveTab(closeActiveBrowserTab),
    shellClient.ui.onSwitchTab(handleSwitchTab),
    shellClient.ui.onSwitchTabAcrossAllTypes(handleSwitchTabAcrossAllTypes),
    shellClient.ui.onSwitchRecentTab(handleSwitchRecentTab),
    shellClient.ui.onSwitchTerminalTab(handleSwitchTerminalTab)
  ]

  const unsubscribeSimulator = shellClient.ui.onNewSimulatorTab?.(() => {
    if (isRuntimeEnvironmentActive()) {
      return
    }
    const worktreeId = useAppStore.getState().activeWorktreeId
    if (worktreeId) {
      void openMobileEmulatorTab(worktreeId, { placement: 'rightSplit' })
    }
  })
  if (unsubscribeSimulator) {
    unsubs.push(unsubscribeSimulator)
  }
  return () => unsubs.forEach((unsubscribe) => unsubscribe())
}
