import { BrowserWindow, type BaseWindow } from 'electron'
import type { KeybindingOverrides } from '~shared/keybindings'
import type { UpdateCheckOptions } from '~shared/types'

import type { Store } from '../persistence'
import { publishShellEvent } from '../shell/events'
import {
  getNextDefaultOnAppearanceSettingValue,
  registerAppMenu,
  rebuildAppMenu
} from './register-app-menu'

type MainProcessMenuOptions = {
  getMainWindow: () => BrowserWindow | null
  getStore: () => Store | null
  getKeybindings: () => KeybindingOverrides | undefined
  checkForUpdates: (options?: UpdateCheckOptions) => void
  beforeReload: (options: { ignoreCache: boolean; webContentsId: number }) => void
  openSettings: () => void
  openSetupGuide: (targetWindow: BrowserWindow | null) => void
  openCrashReport: (targetWindow: BrowserWindow | null) => void
  openFeatureTour: (targetWindow: BrowserWindow | null) => void
}

function publishToMainWindow(
  options: MainProcessMenuOptions,
  event: Parameters<typeof publishShellEvent>[1]
): void {
  const window = options.getMainWindow()
  if (window && !window.isDestroyed()) {
    publishShellEvent(window.webContents.id, event)
  }
}

function asBrowserWindow(target: BaseWindow | null | undefined): BrowserWindow | null {
  return target instanceof BrowserWindow ? target : null
}

export function registerMainProcessMenu(options: MainProcessMenuOptions): void {
  registerAppMenu({
    onCheckForUpdates: options.checkForUpdates,
    onBeforeReload: options.beforeReload,
    onOpenSettings: options.openSettings,
    onOpenSetupGuide: (target) => options.openSetupGuide(asBrowserWindow(target)),
    onOpenCrashReport: (target) => options.openCrashReport(asBrowserWindow(target)),
    onOpenFeatureTour: (target) => options.openFeatureTour(asBrowserWindow(target)),
    onZoomIn: () => publishToMainWindow(options, { type: 'uiTerminalZoom', direction: 'in' }),
    onZoomOut: () => publishToMainWindow(options, { type: 'uiTerminalZoom', direction: 'out' }),
    onZoomReset: () => publishToMainWindow(options, { type: 'uiTerminalZoom', direction: 'reset' }),
    onToggleLeftSidebar: () => publishToMainWindow(options, { type: 'uiToggleLeftSidebar' }),
    onToggleRightSidebar: () => publishToMainWindow(options, { type: 'uiToggleRightSidebar' }),
    onToggleAppearance: (key) => {
      const store = options.getStore()
      if (!store) {
        return
      }
      if (key === 'statusBarVisible') {
        publishToMainWindow(options, { type: 'uiToggleStatusBar' })
        return
      }
      const current = store.getSettings()
      const next = getNextDefaultOnAppearanceSettingValue(current[key])
      store.updateSettings({ [key]: next }, { notifyListeners: true })
      rebuildAppMenu()
    },
    getAppearanceState: () => {
      const store = options.getStore()
      const settings = store?.getSettings()
      const ui = store?.getUI()
      return {
        showMobileButton: settings?.showMobileButton !== false,
        statusBarVisible: ui?.statusBarVisible !== false
      }
    },
    getKeybindings: options.getKeybindings
  })
}
