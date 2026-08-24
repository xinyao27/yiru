import type { BrowserWindow } from 'electron'
import { publishShellEvent } from '~main/shell/events'
import type { KeybindingMatchOptions } from '~shared/keybindings'
import {
  getWindowShortcutActionId,
  windowShortcutActionCapturesTerminal,
  type WindowShortcutAction
} from '~shared/window-shortcut-policy'

import type { CreateMainWindowOptions } from './model'

export type DispatchWindowShortcut = (
  event: Electron.Event,
  action: WindowShortcutAction,
  options: {
    isAutoRepeat: boolean
    focusedShortcutContext: KeybindingMatchOptions
  }
) => boolean

function sendWindowShortcutAction(
  mainWindow: BrowserWindow,
  options: CreateMainWindowOptions | undefined,
  action: WindowShortcutAction
): void {
  switch (action.type) {
    case 'zoom':
      publishShellEvent(mainWindow.webContents.id, {
        type: 'uiTerminalZoom',
        direction: action.direction
      })
      return
    case 'openSettings':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiOpenSettings' })
      return
    case 'forceReload':
      options?.onBeforeReload?.({ ignoreCache: true, webContentsId: mainWindow.webContents.id })
      mainWindow.webContents.reloadIgnoringCache()
      return
    case 'toggleLeftSidebar':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiToggleLeftSidebar' })
      return
    case 'toggleRightSidebar':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiToggleRightSidebar' })
      return
    case 'toggleWorktreePalette':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiToggleWorktreePalette' })
      return
    case 'openQuickOpen':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiOpenQuickOpen' })
      return
    case 'toggleQuickCommandsMenu':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiToggleQuickCommandsMenu' })
      return
    case 'openNewWorkspace':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiOpenNewWorkspace' })
      return
    case 'deleteCurrentWorkspace':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiDeleteCurrentWorkspace' })
      return
    case 'switchRecentTab':
      publishShellEvent(mainWindow.webContents.id, { type: 'uiSwitchRecentTab' })
      return
    case 'jumpToWorktreeIndex':
      publishShellEvent(mainWindow.webContents.id, {
        type: 'uiJumpToWorktreeIndex',
        index: action.index
      })
      return
    case 'jumpToTabIndex':
      publishShellEvent(mainWindow.webContents.id, {
        type: 'uiJumpToTabIndex',
        index: action.index
      })
      return
    case 'worktreeHistoryNavigate':
      publishShellEvent(mainWindow.webContents.id, {
        type: 'uiWorktreeHistoryNavigate',
        direction: action.direction
      })
  }
}

export function createWindowShortcutDispatcher(
  mainWindow: BrowserWindow,
  options: CreateMainWindowOptions | undefined
): DispatchWindowShortcut {
  return (event, action, dispatchOptions) => {
    const { focusedShortcutContext, isAutoRepeat } = dispatchOptions
    const capturedTerminalActionId =
      focusedShortcutContext.context === 'terminal' &&
      focusedShortcutContext.terminalShortcutPolicy === 'yiru-first' &&
      windowShortcutActionCapturesTerminal(action)
        ? getWindowShortcutActionId(action)
        : null

    if (action.type === 'toggleQuickCommandsMenu' && isAutoRepeat) {
      event.preventDefault()
      return true
    }

    event.preventDefault()
    if (capturedTerminalActionId) {
      publishShellEvent(mainWindow.webContents.id, {
        type: 'uiTerminalShortcutCaptured',
        actionId: capturedTerminalActionId
      })
    }
    sendWindowShortcutAction(mainWindow, options, action)
    return true
  }
}
