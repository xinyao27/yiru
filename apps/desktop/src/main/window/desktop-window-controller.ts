import { app, dialog, type BrowserWindow, type Tray } from 'electron'
import type { UpdateCheckOptions } from '~shared/types'

import { createFirstWorkRenameHandler } from '../agent-hooks/first-work-rename-handler'
import {
  recordCoalescedCrashBreadcrumb,
  recordCrashBreadcrumb
} from '../crash-reporting/crash-breadcrumb-store'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import { recordProcessGoneCrash } from '../crash-reporting/process-gone-recorder'
import { translateMain } from '../i18n/main-i18n'
import type { Store } from '../persistence'
import { SyntheticTitleController } from '../pty/synthetic-title-controller'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { publishShellEvent } from '../shell/events'
import type { DevInstanceIdentity } from '../startup/dev-instance-identity'
import { setMacMenuBarIconVisible, type SystemTrayOptions } from '../tray/system-tray'
import { checkForUpdatesFromMenu, isQuittingForUpdate } from '../updater'
import { ensureAutoUpdaterConfigured } from './attach-main-window-services'
import { loadMainWindow } from './create-main-window'
import { focusExistingMainWindow } from './focus-existing-window'
import type { MainWindowRuntimeServices } from './main-window-runtime-services'
import { createMainWindowOpener } from './open-main-window'
import { createRendererReloadLifecycle } from './renderer-reload-lifecycle'

const AGENT_STATE_CRASH_BREADCRUMB_MIN_INTERVAL_MS = 30_000

export class DesktopWindowController {
  readonly #identity: DevInstanceIdentity
  readonly #isServeMode: boolean
  readonly #isQuitting: () => boolean
  readonly #setQuitting: (quitting: boolean) => void
  readonly #getStore: () => Store | null
  readonly #getCrashReports: () => CrashReportStore | null
  readonly #rendererReload
  readonly #syntheticTitles
  readonly #open
  #mainWindow: BrowserWindow | null = null

  constructor(options: {
    identity: DevInstanceIdentity
    isServeMode: boolean
    isQuitting: () => boolean
    setQuitting: (quitting: boolean) => void
    getServices: () => MainWindowRuntimeServices | null
    getStore: () => Store | null
    getRuntime: () => YiruRuntimeService | null
    getCrashReports: () => CrashReportStore | null
    awaitLocalPtyStartup: () => Promise<void>
    prepareForCodexLaunch: Parameters<typeof createMainWindowOpener>[0]['prepareForCodexLaunch']
  }) {
    this.#identity = options.identity
    this.#isServeMode = options.isServeMode
    this.#isQuitting = options.isQuitting
    this.#setQuitting = options.setQuitting
    this.#getStore = options.getStore
    this.#getCrashReports = options.getCrashReports
    this.#rendererReload = createRendererReloadLifecycle({
      isAppQuitting: options.isQuitting,
      isUpdateQuitting: isQuittingForUpdate
    })
    this.#syntheticTitles = new SyntheticTitleController({
      getWindow: () => this.#mainWindow,
      getRuntime: options.getRuntime
    })
    const renameFirstWork = createFirstWorkRenameHandler({
      getStore: options.getStore,
      getRuntime: options.getRuntime
    })
    this.#open = createMainWindowOpener({
      title: options.identity.name,
      state: {
        get: () => this.#mainWindow,
        set: (window) => {
          this.#mainWindow = window
        },
        isQuitting: options.isQuitting,
        setQuitting: options.setQuitting
      },
      getServices: options.getServices,
      rendererReload: this.#rendererReload,
      getSystemTrayOptions: () => this.#getSystemTrayOptions(),
      syncMacMenuBarIcon: (visible) => this.syncMacMenuBarIcon(visible),
      syntheticTitles: this.#syntheticTitles,
      renameFirstWork,
      recordAgentStateCrashBreadcrumb: this.#recordAgentStateCrashBreadcrumb,
      recordProcessGone: this.recordProcessGone,
      presentRendererRecoveryPrompt: this.#presentRendererRecoveryPrompt,
      prepareForCodexLaunch: options.prepareForCodexLaunch,
      awaitLocalPtyStartup: options.awaitLocalPtyStartup
    })
  }

  getWindow = (): BrowserWindow | null => this.#mainWindow

  open = (): BrowserWindow => this.#open()

  focusExisting = (): void => {
    focusExistingMainWindow({
      app,
      getWindow: this.getWindow,
      openWindow: this.open,
      warn: console.warn
    })
  }

  showFromTray = (): void => {
    if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
      if (this.#mainWindow.isMinimized()) {
        this.#mainWindow.restore()
      }
      this.#mainWindow.show()
      this.#mainWindow.focus()
    } else if (!isQuittingForUpdate()) {
      this.open()
    }
  }

  openSettings = (): void => {
    this.showFromTray()
    recordCrashBreadcrumb('settings_opened')
    this.#publish({ type: 'uiOpenSettings' })
  }

  quitFromTray = (): void => {
    if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
      this.showFromTray()
    }
    this.#setQuitting(true)
    app.quit()
  }

  runUpdateCheck = (options?: UpdateCheckOptions): void => {
    ensureAutoUpdaterConfigured()
    checkForUpdatesFromMenu(options)
  }

  syncMacMenuBarIcon = (visible: boolean): Tray | null => {
    if (process.platform !== 'darwin' || this.#isServeMode) {
      return null
    }
    const options = this.#getSystemTrayOptions()
    return options ? setMacMenuBarIconVisible(visible, options) : null
  }

  markExpectedReload = (webContentsId: number): void => {
    if (this.#mainWindow?.webContents.id === webContentsId) {
      this.#rendererReload.markExpected(webContentsId)
    }
  }

  sendOpenFeatureTour = (target?: BrowserWindow | null): void => {
    this.#publish({ type: 'uiOpenFeatureTour' }, target)
  }

  sendOpenSetupGuide = (target?: BrowserWindow | null): void => {
    this.#publish({ type: 'uiOpenSetupGuide' }, target)
  }

  sendOpenCrashReport = (target?: BrowserWindow | null): void => {
    this.#publish({ type: 'uiOpenCrashReport' }, target)
  }

  recordProcessGone = (
    source: 'renderer' | 'child',
    processType: string,
    reason: string,
    exitCode: number | null,
    details: Record<string, unknown>,
    webContentsId?: number
  ): void => {
    recordProcessGoneCrash(this.#getCrashReports(), {
      source,
      processType,
      reason,
      exitCode,
      expectedTeardown: this.#rendererReload.getExpectedTeardownScope(webContentsId),
      details
    })
  }

  #getSystemTrayOptions(): SystemTrayOptions | null {
    if (!this.#getStore()) {
      return null
    }
    return {
      isDevInstance: this.#identity.isDev,
      devInstanceLabel: this.#identity.devLabel,
      onOpen: this.showFromTray,
      onOpenSettings: this.openSettings,
      onCheckForUpdates: () => {
        this.showFromTray()
        this.runUpdateCheck()
      },
      onQuit: this.quitFromTray
    }
  }

  #publish(event: Parameters<typeof publishShellEvent>[1], target?: BrowserWindow | null): void {
    const webContents =
      target && !target.isDestroyed() ? target.webContents : this.#mainWindow?.webContents
    if (webContents) {
      publishShellEvent(webContents.id, event)
    }
  }

  #recordAgentStateCrashBreadcrumb = (agentType: string, state: string): void => {
    recordCoalescedCrashBreadcrumb({
      name: 'agent_state_changed',
      data: { agentType, state },
      coalesceKey: `agent:${agentType}:${state}`,
      minIntervalMs: AGENT_STATE_CRASH_BREADCRUMB_MIN_INTERVAL_MS
    })
  }

  #presentRendererRecoveryPrompt = async (recentRecoveryCount: number): Promise<void> => {
    if (this.#isQuitting()) {
      return
    }
    const buttons = [
      translateMain('app.recoverableError.reload', 'Reload'),
      translateMain('app.recoverableError.quit', 'Quit')
    ]
    const messageOptions = {
      type: 'error' as const,
      buttons,
      defaultId: 0,
      cancelId: 1,
      title: translateMain('app.recoverableError.loadLoopTitle', 'Yiru keeps failing to load'),
      message: translateMain(
        'app.recoverableError.loadLoopMessage',
        'The app window crashed repeatedly and stopped reloading automatically.'
      ),
      detail: translateMain(
        'app.recoverableError.loadLoopDetail',
        'Yiru tried to recover {{value0}} times in a row without success. This is often a graphics-driver or installation problem. Reload to try again, or quit and relaunch Yiru.',
        { value0: recentRecoveryCount }
      )
    }
    const window = this.#mainWindow && !this.#mainWindow.isDestroyed() ? this.#mainWindow : null
    const { response } = window
      ? await dialog.showMessageBox(window, messageOptions)
      : await dialog.showMessageBox(messageOptions)
    if (response === 0 && this.#mainWindow && !this.#mainWindow.isDestroyed()) {
      recordCrashBreadcrumb('renderer_recovery_manual_retry')
      loadMainWindow(this.#mainWindow)
    } else if (response === 1) {
      this.#setQuitting(true)
      app.quit()
    }
  }
}
