import { app, type BrowserWindow } from 'electron'

import { recordCrashBreadcrumb } from '../crash-reporting/crash-breadcrumb-store'
import { shouldRecoverRendererAfterProcessGone } from '../crash-reporting/process-gone-classification'
import type { SyntheticTitleController } from '../pty/synthetic-title-controller'
import { logStartupMilestone } from '../startup/diagnostics'
import { ensureWindowsUserDataAclGrant } from '../startup/windows-user-data-acl'
import { trackAppOpenedOnce } from '../telemetry/client'
import { resolveConsent } from '../telemetry/consent'
import { createSystemTray, setTrayAttention, type SystemTrayOptions } from '../tray/system-tray'
import { createMainWindow, loadMainWindow } from './create-main-window'
import { registerMainWindowAgentStatus } from './main-window-agent-status'
import {
  attachMainWindowRuntimeServices,
  type MainWindowRuntimeServices
} from './main-window-runtime-services'
import { notifyMainWindowBecameVisible } from './main-window-visibility'
import type { RendererReloadLifecycle } from './renderer-reload-lifecycle'

const TRAY_CREATE_FALLBACK_MS = 12_000

type MainWindowState = {
  get: () => BrowserWindow | null
  set: (window: BrowserWindow | null) => void
  isQuitting: () => boolean
  setQuitting: (quitting: boolean) => void
}

type OpenMainWindowOptions = {
  title: string
  state: MainWindowState
  getServices: () => MainWindowRuntimeServices | null
  rendererReload: RendererReloadLifecycle
  getSystemTrayOptions: () => SystemTrayOptions | null
  syncMacMenuBarIcon: (visible: boolean) => unknown
  syntheticTitles: SyntheticTitleController
  renameFirstWork: Parameters<typeof registerMainWindowAgentStatus>[0]['renameFirstWork']
  recordAgentStateCrashBreadcrumb: (agentType: string, state: string) => void
  recordProcessGone: (
    source: 'renderer' | 'child',
    processType: string,
    reason: string,
    exitCode: number | null,
    details: Record<string, unknown>,
    webContentsId?: number
  ) => void
  presentRendererRecoveryPrompt: (recentRecoveryCount: number) => Promise<void>
  prepareForCodexLaunch: Parameters<
    typeof attachMainWindowRuntimeServices
  >[0]['prepareForCodexLaunch']
  awaitLocalPtyStartup: () => Promise<void>
}

export function createMainWindowOpener(options: OpenMainWindowOptions): () => BrowserWindow {
  return () => {
    logStartupMilestone('open-main-window-start')
    const services = options.getServices()
    if (!services) {
      throw new Error('Desktop services must be initialized before opening the main window')
    }
    if (process.platform === 'win32') {
      logStartupMilestone('acl-grant-start')
      ensureWindowsUserDataAclGrant(app.getPath('userData'), {
        onDone: (result) => {
          logStartupMilestone('acl-grant-done', { mode: result.mode })
          if (result.mode === 'failed') {
            console.warn('[win32-acl] userData ACL grant failed:', result.reason)
          }
        }
      })
    }

    const window = createMainWindow(services.store, {
      getIsQuitting: options.state.isQuitting,
      onQuitAborted: () => {
        options.state.setQuitting(false)
        options.rendererReload.clearExpected()
      },
      onRendererProcessGone: (details, webContentsId) => {
        options.recordProcessGone(
          'renderer',
          'renderer',
          details.reason,
          details.exitCode ?? null,
          { processType: 'renderer' },
          webContentsId
        )
      },
      shouldRecoverRenderer: (details, webContentsId) =>
        shouldRecoverRendererAfterProcessGone({
          reason: details.reason,
          expectedTeardown: options.rendererReload.getExpectedTeardownScope(webContentsId)
        }),
      onRendererRecoveryExhausted: ({ details, recentRecoveryCount }) => {
        recordCrashBreadcrumb('renderer_recovery_circuit_breaker_open', {
          reason: details.reason,
          exitCode: details.exitCode ?? null,
          recentRecoveryCount
        })
        void options.presentRendererRecoveryPrompt(recentRecoveryCount)
      },
      deferLoad: true,
      title: options.title,
      getKeybindings: () => services.keybindings.getOverrides(),
      onBeforeReload: ({ ignoreCache, webContentsId }) => {
        if (options.state.get()?.webContents.id === webContentsId) {
          options.rendererReload.markExpected(webContentsId)
        }
        recordCrashBreadcrumb('manual_reload_requested', { ignoreCache })
      },
      onBeforeRecoveryReload: (webContentsId) => {
        options.rendererReload.markRecoveryInFlight(webContentsId)
        recordCrashBreadcrumb('renderer_recovery_reload')
      }
    })
    recordCrashBreadcrumb('main_window_created')
    logStartupMilestone('window-created')

    let trayCreated = false
    const createSystemTrayDeferred = (): void => {
      if (trayCreated || window.isDestroyed() || options.state.isQuitting()) {
        return
      }
      trayCreated = true
      if (process.platform === 'darwin') {
        if (options.syncMacMenuBarIcon(services.store.getSettings().showMenuBarIcon !== false)) {
          logStartupMilestone('tray-created')
        }
        return
      }
      const trayOptions = options.getSystemTrayOptions()
      if (trayOptions && createSystemTray(trayOptions)) {
        logStartupMilestone('tray-created')
      }
    }
    window.once('ready-to-show', () => {
      logStartupMilestone('ready-to-show')
      setImmediate(createSystemTrayDeferred)
    })
    const trayCreateFallback = setTimeout(createSystemTrayDeferred, TRAY_CREATE_FALLBACK_MS)
    trayCreateFallback.unref?.()

    const rendererWebContentsId = window.webContents.id
    window.webContents.on('did-finish-load', () => {
      options.rendererReload.clearExpected(rendererWebContentsId)
      recordCrashBreadcrumb('main_window_loaded')
      logStartupMilestone('did-finish-load')
      if (resolveConsent(services.store.getSettings()).effective === 'enabled') {
        trackAppOpenedOnce()
      }
    })
    attachMainWindowRuntimeServices({
      window,
      services,
      rendererReload: options.rendererReload,
      prepareForCodexLaunch: options.prepareForCodexLaunch,
      awaitLocalPtyStartup: options.awaitLocalPtyStartup,
      setQuitting: () => options.state.setQuitting(true),
      recordReload: (ignoreCache) => {
        recordCrashBreadcrumb('renderer_reload_requested', { ignoreCache })
      }
    })

    const unregisterAgentStatus = registerMainWindowAgentStatus({
      runtime: services.runtime,
      syntheticTitles: options.syntheticTitles,
      renameFirstWork: options.renameFirstWork,
      recordCrashBreadcrumb: options.recordAgentStateCrashBreadcrumb
    })
    window.on('closed', () => {
      if (options.state.get() === window) {
        options.state.set(null)
      }
      options.rendererReload.clearExpected(rendererWebContentsId)
      unregisterAgentStatus()
      options.syntheticTitles.stopAll()
    })
    options.state.set(window)
    window.on('show', () => options.syntheticTitles.resume())
    window.on('restore', () => options.syntheticTitles.resume())
    window.on('hide', () => options.syntheticTitles.stopTimer())
    window.on('minimize', () => options.syntheticTitles.stopTimer())
    window.on('show', notifyMainWindowBecameVisible)
    window.on('restore', notifyMainWindowBecameVisible)
    window.on('show', () => setTrayAttention(false))
    window.on('restore', () => setTrayAttention(false))
    logStartupMilestone('load-start')
    loadMainWindow(window)
    return window
  }
}
