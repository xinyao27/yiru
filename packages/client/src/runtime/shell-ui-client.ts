import type { ShellEvent } from '@yiru/runtime-protocol/contract'
import type { ReadClipboardTextOptions } from '@yiru/runtime-protocol/model/ui'
import {
  isKeybindingActionId,
  type KeybindingActionId
} from '@yiru/runtime-protocol/workbench/keybindings'
import type { NativeFileDropPayload } from '~renderer/native-file-drop'
import type { RichMarkdownContextMenuCommandPayload } from '~renderer/rich-markdown-context-menu'

import { callShellOrpc } from './orpc-client'
import { subscribeShellEvent, subscribeShellEventResync } from './shell-events-client'

type Unsubscribe = () => void

export type ShellUiApi = {
  onOpenSettings: (callback: () => void) => Unsubscribe
  onOpenSetupGuide: (callback: () => void) => Unsubscribe
  onOpenFeatureTour: (callback: () => void) => Unsubscribe
  onOpenCrashReport: (callback: () => void) => Unsubscribe
  onToggleLeftSidebar: (callback: () => void) => Unsubscribe
  onToggleRightSidebar: (callback: () => void) => Unsubscribe
  onToggleCommandPalette: (callback: () => void) => Unsubscribe
  onTerminalShortcutCaptured: (
    callback: (data: { actionId: KeybindingActionId }) => void
  ) => Unsubscribe
  onOpenQuickOpen: (callback: () => void) => Unsubscribe
  onToggleQuickCommandsMenu: (callback: () => void) => Unsubscribe
  onOpenNewWorkspace: (callback: () => void) => Unsubscribe
  onDeleteCurrentWorkspace: (callback: () => void) => Unsubscribe
  onJumpToWorktreeIndex: (callback: (index: number) => void) => Unsubscribe
  onJumpToTabIndex: (callback: (index: number) => void) => Unsubscribe
  onWorktreeHistoryNavigate: (callback: (direction: 'back' | 'forward') => void) => Unsubscribe
  onNewBrowserTab: (callback: () => void) => Unsubscribe
  onNewMarkdownTab: (callback: () => void) => Unsubscribe
  onNewSimulatorTab: (callback: () => void) => Unsubscribe
  onNewTerminalTab: (callback: () => void) => Unsubscribe
  onFocusBrowserAddressBar: (callback: () => void) => Unsubscribe
  onFindInBrowserPage: (callback: () => void) => Unsubscribe
  onReloadBrowserPage: (callback: () => void) => Unsubscribe
  onBrowserHistoryNavigate: (callback: (direction: 'back' | 'forward') => void) => Unsubscribe
  onZoomBrowserPage: (callback: (direction: 'in' | 'out' | 'reset') => void) => Unsubscribe
  onHardReloadBrowserPage: (callback: () => void) => Unsubscribe
  onCloseActiveTab: (callback: () => void) => Unsubscribe
  onSwitchTab: (callback: (direction: 1 | -1) => void) => Unsubscribe
  onSwitchTabAcrossAllTypes: (callback: (direction: 1 | -1) => void) => Unsubscribe
  onSwitchRecentTab: (callback: () => void) => Unsubscribe
  onSwitchTerminalTab: (callback: (direction: 1 | -1) => void) => Unsubscribe
  onCtrlTabKeyDown: (callback: (data: { shiftKey: boolean }) => void) => Unsubscribe
  onCtrlTabKeyUp: (callback: () => void) => Unsubscribe
  onToggleStatusBar: (callback: () => void) => Unsubscribe
  onExportPdfRequested: (callback: () => void) => Unsubscribe
  onAppMenuPaste: (callback: () => void) => Unsubscribe
  onEditableContextPaste: (callback: (data: { plainTextOnly: boolean }) => void) => Unsubscribe
  onTerminalZoom: (callback: (direction: 'in' | 'out' | 'reset') => void) => Unsubscribe
  onSystemResumed: (callback: () => void) => Unsubscribe
  onWindowFocused: (callback: () => void) => Unsubscribe
  onFileDrop: (callback: (data: NativeFileDropPayload) => void) => Unsubscribe
  onRichMarkdownContextCommand: (
    callback: (payload: RichMarkdownContextMenuCommandPayload) => void
  ) => Unsubscribe
  onFullscreenChanged: (callback: (isFullScreen: boolean) => void) => Unsubscribe
  onMaximizeChanged: (callback: (isMaximized: boolean) => void) => Unsubscribe
  onWindowCloseRequested: (callback: (data: { isQuitting: boolean }) => void) => Unsubscribe
  readClipboardText: (options?: ReadClipboardTextOptions) => Promise<string>
  readSelectionClipboardText: (options?: ReadClipboardTextOptions) => Promise<string>
  readClipboardImageBase64: () => Promise<string | null>
  saveClipboardImageAsTempFile: (args?: {
    connectionId?: string | null
    runtimeEnvironmentId?: string | null
  }) => Promise<string | null>
  writeClipboardText: (text: string) => Promise<void>
  writeSelectionClipboardText: (text: string) => Promise<void>
  writeClipboardImage: (dataUrl: string) => Promise<void>
  performNativePaste: (options?: { mode?: 'paste' | 'paste-and-match-style' }) => void
  writeClipboardFile: (
    args: { filePath: string } | string
  ) => Promise<{ ok: boolean; reason?: string }>
  getZoomLevel: () => number
  setZoomLevel: (level: number) => void
  syncTrafficLights: (zoomFactor: number) => void
  setMarkdownEditorFocused: (focused: boolean) => void
  setTerminalInputFocused: (focused: boolean) => void
  setShortcutRecorderFocused: (focused: boolean) => void
  minimize: () => void
  maximize: () => void
  isMaximized: () => Promise<boolean>
  requestClose: () => void
  popupMenu: () => void
  confirmWindowClose: () => void
}

let zoomLevelSnapshot = 0
let isResyncHydrationRegistered = false

function subscribeType(type: ShellEvent['type'], callback: () => void): Unsubscribe {
  return subscribeShellEvent((event) => {
    if (event.type === type) {
      callback()
    }
  })
}

function fireShellUi(promise: Promise<unknown>): void {
  void promise.catch(() => {})
}

export function hydrateShellUi(): Promise<void> {
  if (!isResyncHydrationRegistered) {
    isResyncHydrationRegistered = true
    subscribeShellEventResync(() => {
      void refreshShellUiSnapshot()
    })
  }
  return refreshShellUiSnapshot()
}

function refreshShellUiSnapshot(): Promise<void> {
  return callShellOrpc((client) => client.shell.ui.getZoomLevel, undefined)
    .then((level) => {
      zoomLevelSnapshot = level
    })
    .catch(() => {})
}

export const electronShellUiApi: ShellUiApi = {
  onOpenSettings: (callback) => subscribeType('uiOpenSettings', callback),
  onOpenSetupGuide: (callback) => subscribeType('uiOpenSetupGuide', callback),
  onOpenFeatureTour: (callback) => subscribeType('uiOpenFeatureTour', callback),
  onOpenCrashReport: (callback) => subscribeType('uiOpenCrashReport', callback),
  onToggleLeftSidebar: (callback) => subscribeType('uiToggleLeftSidebar', callback),
  onToggleRightSidebar: (callback) => subscribeType('uiToggleRightSidebar', callback),
  onToggleCommandPalette: (callback) => subscribeType('uiToggleCommandPalette', callback),
  onTerminalShortcutCaptured: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiTerminalShortcutCaptured' && isKeybindingActionId(event.actionId)) {
        callback({ actionId: event.actionId })
      }
    }),
  onOpenQuickOpen: (callback) => subscribeType('uiOpenQuickOpen', callback),
  onToggleQuickCommandsMenu: (callback) => subscribeType('uiToggleQuickCommandsMenu', callback),
  onOpenNewWorkspace: (callback) => subscribeType('uiOpenNewWorkspace', callback),
  onDeleteCurrentWorkspace: (callback) => subscribeType('uiDeleteCurrentWorkspace', callback),
  onJumpToWorktreeIndex: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiJumpToWorktreeIndex') {
        callback(event.index)
      }
    }),
  onJumpToTabIndex: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiJumpToTabIndex') {
        callback(event.index)
      }
    }),
  onWorktreeHistoryNavigate: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiWorktreeHistoryNavigate') {
        callback(event.direction)
      }
    }),
  onNewBrowserTab: (callback) => subscribeType('uiNewBrowserTab', callback),
  onNewMarkdownTab: (callback) => subscribeType('uiNewMarkdownTab', callback),
  onNewSimulatorTab: (callback) => subscribeType('uiNewSimulatorTab', callback),
  onNewTerminalTab: (callback) => subscribeType('uiNewTerminalTab', callback),
  onFocusBrowserAddressBar: (callback) => subscribeType('uiFocusBrowserAddressBar', callback),
  onFindInBrowserPage: (callback) => subscribeType('uiFindInBrowserPage', callback),
  onReloadBrowserPage: (callback) => subscribeType('uiReloadBrowserPage', callback),
  onBrowserHistoryNavigate: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiBrowserHistoryNavigate') {
        callback(event.direction)
      }
    }),
  onZoomBrowserPage: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiZoomBrowserPage') {
        callback(event.direction)
      }
    }),
  onHardReloadBrowserPage: (callback) => subscribeType('uiHardReloadBrowserPage', callback),
  onCloseActiveTab: (callback) => subscribeType('uiCloseActiveTab', callback),
  onSwitchTab: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiSwitchTab') {
        callback(event.direction)
      }
    }),
  onSwitchTabAcrossAllTypes: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiSwitchTabAcrossAllTypes') {
        callback(event.direction)
      }
    }),
  onSwitchRecentTab: (callback) => subscribeType('uiSwitchRecentTab', callback),
  onSwitchTerminalTab: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiSwitchTerminalTab') {
        callback(event.direction)
      }
    }),
  onCtrlTabKeyDown: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiCtrlTabKeyDown') {
        callback({ shiftKey: event.shiftKey })
      }
    }),
  onCtrlTabKeyUp: (callback) => subscribeType('uiCtrlTabKeyUp', callback),
  onToggleStatusBar: (callback) => subscribeType('uiToggleStatusBar', callback),
  onExportPdfRequested: (callback) => subscribeType('uiExportPdfRequested', callback),
  onAppMenuPaste: (callback) => subscribeType('uiAppMenuPaste', callback),
  onEditableContextPaste: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiEditableContextPaste') {
        callback({ plainTextOnly: event.plainTextOnly })
      }
    }),
  onTerminalZoom: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiTerminalZoom') {
        callback(event.direction)
      }
    }),
  onSystemResumed: (callback) => subscribeType('uiSystemResumed', callback),
  onWindowFocused: (callback) => subscribeType('uiWindowFocused', callback),
  onFileDrop: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiFileDrop') {
        callback(event.payload)
      }
    }),
  onRichMarkdownContextCommand: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiRichMarkdownContextCommand') {
        callback({ command: event.command, x: event.x, y: event.y })
      }
    }),
  onFullscreenChanged: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiFullscreenChanged') {
        callback(event.isFullScreen)
      }
    }),
  onMaximizeChanged: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiMaximizeChanged') {
        callback(event.isMaximized)
      }
    }),
  onWindowCloseRequested: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'uiWindowCloseRequested') {
        callback({ isQuitting: event.isQuitting })
      }
    }),
  readClipboardText: (input) => callShellOrpc((client) => client.shell.ui.readClipboardText, input),
  readSelectionClipboardText: (input) =>
    callShellOrpc((client) => client.shell.ui.readSelectionClipboardText, input),
  readClipboardImageBase64: () =>
    callShellOrpc((client) => client.shell.ui.readClipboardImageBase64, undefined),
  saveClipboardImageAsTempFile: (input) =>
    callShellOrpc((client) => client.shell.ui.saveClipboardImageAsTempFile, input),
  writeClipboardText: (text) =>
    callShellOrpc((client) => client.shell.ui.writeClipboardText, { text }),
  writeSelectionClipboardText: (text) =>
    callShellOrpc((client) => client.shell.ui.writeSelectionClipboardText, { text }),
  writeClipboardImage: (dataUrl) =>
    callShellOrpc((client) => client.shell.ui.writeClipboardImage, { dataUrl }),
  performNativePaste: (input = {}) =>
    fireShellUi(callShellOrpc((client) => client.shell.ui.performNativePaste, input)),
  writeClipboardFile: (input) =>
    callShellOrpc((client) => client.shell.ui.writeClipboardFile, {
      filePath: typeof input === 'string' ? input : input.filePath
    }),
  getZoomLevel: () => zoomLevelSnapshot,
  setZoomLevel: (level) => {
    zoomLevelSnapshot = level
    fireShellUi(callShellOrpc((client) => client.shell.ui.setZoomLevel, { level }))
  },
  syncTrafficLights: (zoomFactor) =>
    fireShellUi(callShellOrpc((client) => client.shell.ui.syncTrafficLights, { zoomFactor })),
  setMarkdownEditorFocused: (focused) =>
    fireShellUi(callShellOrpc((client) => client.shell.ui.setMarkdownEditorFocused, { focused })),
  setTerminalInputFocused: (focused) =>
    fireShellUi(callShellOrpc((client) => client.shell.ui.setTerminalInputFocused, { focused })),
  setShortcutRecorderFocused: (focused) =>
    fireShellUi(callShellOrpc((client) => client.shell.ui.setShortcutRecorderFocused, { focused })),
  minimize: () => fireShellUi(callShellOrpc((client) => client.shell.ui.minimize, undefined)),
  maximize: () => fireShellUi(callShellOrpc((client) => client.shell.ui.maximize, undefined)),
  isMaximized: () => callShellOrpc((client) => client.shell.ui.isMaximized, undefined),
  requestClose: () =>
    fireShellUi(callShellOrpc((client) => client.shell.ui.requestClose, undefined)),
  popupMenu: () => fireShellUi(callShellOrpc((client) => client.shell.ui.popupMenu, undefined)),
  confirmWindowClose: () =>
    fireShellUi(callShellOrpc((client) => client.shell.ui.confirmWindowClose, undefined))
}
