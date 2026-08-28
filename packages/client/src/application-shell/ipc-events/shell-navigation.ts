import { openCommandPalette } from '~renderer/extension/command-palette/open'
import { shellClient } from '~renderer/runtime/shell-client'
import { subscribeShellEvent } from '~renderer/runtime/shell-events-client'
import { subscribeRuntimeUIChanges } from '~renderer/runtime/ui-client'
import { getVisibleWorktreeIds } from '~renderer/sidebar/visible-worktrees'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { TOGGLE_QUICK_COMMANDS_MENU_EVENT } from '~renderer/tab-bar/quick-commands-menu-events'
import { showTerminalShortcutCaptureNotification } from '~renderer/terminal-workspace/terminal-shortcut-capture-notification'
import { showWorkspaceSidebar } from '~renderer/workspace-panel/show-sidebar'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { runWorktreeDelete } from '../../sidebar/delete-worktree/flow'
import { activateTabNumberShortcut } from '../tab-number-shortcuts'

function shortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}

export function openNewWorkspaceFromShortcut(
  state: Pick<AppState, 'activeModal' | 'openModal'>
): void {
  if (state.activeModal !== 'new-workspace-composer') {
    state.openModal('new-workspace-composer', { telemetrySource: 'shortcut' })
  }
}

export function subscribeShellNavigationEvents(): () => void {
  const unsubs = [
    shellClient.ui.onOpenSettings(() => useAppStore.getState().openSettingsPage()),
    shellClient.ui.onOpenSetupGuide?.(() => {
      useAppStore.getState().openModal('setup-guide', { telemetrySource: 'help_menu' })
    }) ?? (() => {}),
    shellClient.ui.onOpenFeatureTour(() => {
      useAppStore.getState().openModal('feature-wall', { source: 'help_menu' })
    }),
    subscribeShellEvent((event) => {
      if (event.type === 'settingsChanged') {
        void useAppStore.getState().fetchSettings()
      }
    }),
    subscribeRuntimeUIChanges((ui) => useAppStore.getState().hydratePersistedUI(ui, 'sync')),
    shellClient.ui.onToggleLeftSidebar(() => useAppStore.getState().toggleSidebar()),
    shellClient.ui.onToggleRightSidebar(() => {
      const store = useAppStore.getState()
      if (store.activeView === 'terminal' && store.activeWorktreeId) {
        showWorkspaceSidebar({ view: 'explorer' })
      }
    }),
    shellClient.ui.onToggleCommandPalette(openCommandPalette),
    shellClient.ui.onOpenQuickOpen(() => {
      const store = useAppStore.getState()
      if (store.activeView === 'terminal' && store.activeWorktreeId) {
        openCommandPalette()
      }
    }),
    shellClient.ui.onToggleQuickCommandsMenu(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_QUICK_COMMANDS_MENU_EVENT))
    }),
    shellClient.ui.onOpenNewWorkspace(() => openNewWorkspaceFromShortcut(useAppStore.getState())),
    shellClient.ui.onJumpToWorktreeIndex((index) => {
      if (useAppStore.getState().activeView !== 'terminal') {
        return
      }
      const visibleIds = getVisibleWorktreeIds()
      if (index < visibleIds.length) {
        activateAndRevealWorktree(visibleIds[index])
      }
    }),
    shellClient.ui.onJumpToTabIndex(activateTabNumberShortcut),
    shellClient.ui.onWorktreeHistoryNavigate((direction) => {
      const store = useAppStore.getState()
      if (store.activeView !== 'terminal') {
        return
      }
      if (direction === 'back') {
        store.goBackWorktree()
      } else {
        store.goForwardWorktree()
      }
    }),
    shellClient.ui.onToggleStatusBar(() => {
      const store = useAppStore.getState()
      store.setStatusBarVisible(!store.statusBarVisible)
    }),
    shellClient.updater.onStatus((status) => useAppStore.getState().setUpdateStatus(status)),
    shellClient.updater.onClearDismissal(() =>
      useAppStore.getState().clearDismissedUpdateVersion()
    ),
    shellClient.ui.onFullscreenChanged((isFullScreen) =>
      useAppStore.getState().setIsFullScreen(isFullScreen)
    )
  ]

  if (shellClient.keybindings) {
    unsubs.push(
      shellClient.keybindings.onChanged((snapshot) =>
        useAppStore.getState().setKeybindingSnapshot(snapshot)
      )
    )
  }
  if (shellClient.ui.onTerminalShortcutCaptured) {
    unsubs.push(
      shellClient.ui.onTerminalShortcutCaptured(({ actionId }) =>
        showTerminalShortcutCaptureNotification({
          actionId,
          platform: shortcutPlatform(),
          keybindings: useAppStore.getState().keybindings
        })
      )
    )
  }
  if (shellClient.ui.onDeleteCurrentWorkspace) {
    unsubs.push(
      shellClient.ui.onDeleteCurrentWorkspace(() => {
        const store = useAppStore.getState()
        if (
          store.activeModal === 'none' &&
          store.activeView === 'terminal' &&
          store.activeWorktreeId
        ) {
          runWorktreeDelete(store.activeWorktreeId)
        }
      })
    )
  }

  void shellClient.updater
    .getStatus()
    .then((status) => useAppStore.getState().setUpdateStatus(status))
  return () => unsubs.forEach((unsubscribe) => unsubscribe())
}
