import {
  assertClipboardTextWriteWithinLimitWithYield,
  assertClipboardTextWithinLimitWithYield
} from '@yiru/workbench-model/ui'
import { translate } from '~renderer/i18n/i18n'

import { readWebUIState } from './web-ui-state'

type WebShellUIApi = Omit<Window['api']['ui'], 'get' | 'set' | 'recordFeatureInteraction'>

const noopUnsubscribe = (): void => {}

function unavailableSelectionClipboardError(): Error {
  return new Error(
    translate(
      'auto.runtime.webUiShellClient.selectionClipboardUnavailable',
      'Selection clipboard is unavailable in the web client.'
    )
  )
}

function createWebShellUIApi(): WebShellUIApi {
  let zoomLevel = readWebUIState().uiZoomLevel
  return {
    readClipboardText: async (options) =>
      assertClipboardTextWithinLimitWithYield(
        await (navigator.clipboard?.readText?.() ?? ''),
        options
      ),
    readSelectionClipboardText: () => Promise.reject(unavailableSelectionClipboardError()),
    readClipboardImageBase64: async () =>
      (await import('./web-clipboard')).readWebClipboardImageBase64(),
    saveClipboardImageAsTempFile: async (args) =>
      (await import('./web-clipboard')).saveWebClipboardImageAsTempFile(args),
    writeClipboardText: async (text) => {
      await assertClipboardTextWriteWithinLimitWithYield(text)
      await (navigator.clipboard?.writeText?.(text) ?? Promise.resolve())
    },
    writeSelectionClipboardText: () => Promise.reject(unavailableSelectionClipboardError()),
    writeClipboardImage: async (dataUrl) =>
      (await import('./web-clipboard')).writeWebClipboardImage(dataUrl),
    writeClipboardFile: () => Promise.resolve({ ok: false, reason: 'unsupported-platform' }),
    performNativePaste: () => {
      document.execCommand?.('paste')
    },
    onExportPdfRequested: () => noopUnsubscribe,
    onAppMenuPaste: () => noopUnsubscribe,
    onEditableContextPaste: () => noopUnsubscribe,
    getZoomLevel: () => zoomLevel,
    setZoomLevel: (level) => {
      zoomLevel = level
    },
    isMaximized: () => Promise.resolve(false),
    onOpenSettings: () => noopUnsubscribe,
    consumePendingOpenSettings: () => Promise.resolve(false),
    onOpenSetupGuide: () => noopUnsubscribe,
    onOpenFeatureTour: () => noopUnsubscribe,
    onOpenCrashReport: () => noopUnsubscribe,
    onToggleLeftSidebar: () => noopUnsubscribe,
    onToggleRightSidebar: () => noopUnsubscribe,
    onToggleWorktreePalette: () => noopUnsubscribe,
    onToggleFloatingTerminal: () => noopUnsubscribe,
    onToggleAssistant: () => noopUnsubscribe,
    onTerminalShortcutCaptured: () => noopUnsubscribe,
    onOpenQuickOpen: () => noopUnsubscribe,
    onToggleQuickCommandsMenu: () => noopUnsubscribe,
    onOpenNewWorkspace: () => noopUnsubscribe,
    onDeleteCurrentWorkspace: () => noopUnsubscribe,
    onJumpToWorktreeIndex: () => noopUnsubscribe,
    onJumpToTabIndex: () => noopUnsubscribe,
    onWorktreeHistoryNavigate: () => noopUnsubscribe,
    onNewBrowserTab: () => noopUnsubscribe,
    onNewMarkdownTab: () => noopUnsubscribe,
    onNewSimulatorTab: () => noopUnsubscribe,
    onNewTerminalTab: () => noopUnsubscribe,
    onFocusBrowserAddressBar: () => noopUnsubscribe,
    onFindInBrowserPage: () => noopUnsubscribe,
    onReloadBrowserPage: () => noopUnsubscribe,
    onBrowserHistoryNavigate: () => noopUnsubscribe,
    onZoomBrowserPage: () => noopUnsubscribe,
    onHardReloadBrowserPage: () => noopUnsubscribe,
    onCloseActiveTab: () => noopUnsubscribe,
    onSwitchTab: () => noopUnsubscribe,
    onSwitchTabAcrossAllTypes: () => noopUnsubscribe,
    onSwitchRecentTab: () => noopUnsubscribe,
    onSwitchTerminalTab: () => noopUnsubscribe,
    onCtrlTabKeyDown: () => noopUnsubscribe,
    onCtrlTabKeyUp: () => noopUnsubscribe,
    onToggleStatusBar: () => noopUnsubscribe,
    onDictationKeyDown: () => noopUnsubscribe,
    onTerminalZoom: () => noopUnsubscribe,
    onSystemResumed: () => noopUnsubscribe,
    onFileDrop: () => noopUnsubscribe,
    syncTrafficLights: () => {},
    setMarkdownEditorFocused: () => {},
    setTerminalInputFocused: () => {},
    setFloatingTerminalInputFocused: () => {},
    setShortcutRecorderFocused: () => {},
    onRichMarkdownContextCommand: () => noopUnsubscribe,
    onFullscreenChanged: () => noopUnsubscribe,
    minimize: () => {},
    maximize: () => {},
    onMaximizeChanged: () => noopUnsubscribe,
    requestClose: () => {},
    popupMenu: () => {},
    onWindowCloseRequested: () => noopUnsubscribe,
    confirmWindowClose: () => {}
  }
}

let webShellUIApi: WebShellUIApi | null = null

export function getWebShellUIApi(): WebShellUIApi {
  webShellUIApi ??= createWebShellUIApi()
  return webShellUIApi
}
