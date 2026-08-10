/* eslint-disable max-lines -- Why: this file is the central main-window IPC wiring point; splitting it during the mobile release compatibility rebase would increase release risk. */
import { app, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import type { BrowserWindow } from 'electron'
import { isNativeFileDropPayload, type NativeFileDropPayload } from '~shared/native-file-drop'
import type { UpdateCheckOptions } from '~shared/types'

import { browserManager } from '../browser/manager'
import { hasSystemMediaAccess, requestSystemMediaAccess } from '../browser/media-access'
import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'
import type { ClaudeAccountSelectionTarget } from '../claude/accounts/runtime-selection'
import type { CodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import { registerFridayHandlers } from '../friday/ipc'
import type { FridayService } from '../friday/service'
import { electronIpcRegistration } from '../ipc/electron-ipc-registration'
import { hydrateLocalPtyRegistryAtBoot } from '../memory/hydrate-local-pty-registry'
import type { Store } from '../persistence'
import { registerRepoHandlers } from '../project-groups/repos'
import { registerPtyHandlers } from '../pty/pty'
import { electronShellServicesConnectionId } from '../runtime/rpc/orpc/shell-services-identity'
import { subscribeShellServicesConnectionLifecycle } from '../runtime/rpc/orpc/shell-services-reverse-link'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { logStartupMilestone } from '../startup/diagnostics'
import { scheduleHistoryGc } from '../terminal-history'
import {
  checkForUpdatesFromMenu,
  downloadUpdate,
  getUpdateStatus,
  quitAndInstall,
  setupAutoUpdater,
  dismissNudge
} from '../updater'
import {
  scheduleWorktreeBaseDirectoryWatcherSync,
  setWorktreeBaseDirectoryWatcherSyncContext
} from '../worktree/base-directory-watcher'
import { getKnownWorktreeIdsForHistoryGc } from './history-gc-worktree-ids'

const UPDATER_SETUP_FALLBACK_MS = 15_000

// Why: updater setup is deferred past first paint, but a manual check (app
// menu or updater:check IPC) can arrive inside that window — it must run
// against a configured updater (listeners, autoDownload=false, window ref),
// so those entry points force the pending setup first.
let pendingAutoUpdaterSetup: (() => void) | null = null

export function ensureAutoUpdaterConfigured(): void {
  pendingAutoUpdaterSetup?.()
}

let appReloadHandlerTokenCounter = 0
let activeAppReloadHandlerToken: number | null = null

export function attachMainWindowServices(
  mainWindow: BrowserWindow,
  store: Store,
  runtime: YiruRuntimeService,
  getSelectedCodexHomePath?: (target?: CodexAccountSelectionTarget) => string | null,
  prepareClaudeAuth?: (
    target?: ClaudeAccountSelectionTarget
  ) => Promise<ClaudeRuntimeAuthPreparation>,
  options?: {
    awaitLocalPtyStartup?: () => Promise<void>
    onBeforeRendererReload?: (args: { webContentsId: number; ignoreCache: boolean }) => void
    // Why: lets the PTY orphan sweep skip the one crash-recovery reload (#5787).
    isRecoveryReloadInFlight?: (webContentsId: number) => boolean
    onBeforeUpdateQuit?: () => void | Promise<void>
    friday?: FridayService
  }
): void {
  registerAppReloadHandler(mainWindow, options?.onBeforeRendererReload)
  registerRepoHandlers(electronIpcRegistration, store, runtime, {
    pickDirectory: async (pickerOptions) => {
      const properties: NonNullable<OpenDialogOptions['properties']> = ['openDirectory']
      if (pickerOptions?.multiple === true) {
        properties.push('multiSelections')
      }
      const result = await dialog.showOpenDialog(mainWindow, {
        properties
      })
      return result.canceled ? [] : result.filePaths
    }
  })
  setWorktreeBaseDirectoryWatcherSyncContext(store)
  scheduleWorktreeBaseDirectoryWatcherSync(store)
  registerPtyHandlers(
    mainWindow,
    runtime,
    getSelectedCodexHomePath,
    () => store.getSettings(),
    prepareClaudeAuth,
    store,
    {
      awaitLocalPtyStartup: options?.awaitLocalPtyStartup,
      isRecoveryReloadInFlight: options?.isRecoveryReloadInFlight
    }
  )
  if (options?.friday) {
    registerFridayHandlers(mainWindow, options.friday)
  }
  // Why: the Manage Sessions settings panel (docs/daemon-staleness-ux.md §Phase 1)
  // uses a narrow `pty:management:*` IPC surface that reads the live
  // DaemonPtyRouter via getDaemonProvider(). Registering here — after
  // registerPtyHandlers — keeps this wiring alongside the rest of the PTY IPC
  // and ensures the handlers are re-installed on macOS app re-activation when
  // the main window is recreated.
  // Why: do not enumerate repo paths from background GC. `git worktree list`
  // can re-touch protected folders on macOS and trigger folder-access prompts.
  scheduleHistoryGc(async () => {
    return getKnownWorktreeIdsForHistoryGc(store)
  })
  // Why: warm-reattach gap.
  // Daemon-hosted PTYs survive renderer restarts on purpose, so on a fresh
  // Yiru launch the daemon's `listSessions()` returns sessions that
  // `pty:spawn` hasn't re-registered yet. Without this hydration, the
  // memory snapshot omits those PTYs and the renderer mislabels their
  // workspaces as `· REMOTE` while showing `—` for CPU/Memory.
  // `hydrateLocalPtyRegistryAtBoot` is idempotent (no-op after the first
  // call), so calling it on every macOS dock re-activation — when this
  // function re-runs as the main window is recreated — does not redo the
  // git I/O or daemon RPC.
  void hydrateLocalPtyRegistryAtBoot(store)
  const localPtyStartupReady = options?.awaitLocalPtyStartup?.()
  if (localPtyStartupReady) {
    void localPtyStartupReady
      .then(() => hydrateLocalPtyRegistryAtBoot(store))
      .catch((error) => {
        console.warn(
          '[memory] Deferred pty-registry hydration skipped:',
          error instanceof Error ? error.message : String(error)
        )
      })
  }
  registerFileDropRelay(mainWindow)
  // Why: setupAutoUpdater's first getAutoUpdater() call synchronously
  // require()s electron-updater in packaged builds — seconds on a cold
  // Windows disk under Defender scanning (part of issue #7225's pre-paint
  // stall) — so defer it past first paint. The timer fallback keeps update
  // checks alive for renderers that crash-loop before ever painting.
  let updaterSetupDone = false
  const setupAutoUpdaterDeferred = (): void => {
    if (updaterSetupDone || mainWindow.isDestroyed()) {
      return
    }
    updaterSetupDone = true
    setupAutoUpdater(mainWindow, {
      getLastUpdateCheckAt: () => store.getUI().lastUpdateCheckAt,
      onBeforeQuit: async () => {
        try {
          await options?.onBeforeUpdateQuit?.()
        } finally {
          store.flush()
        }
      },
      setLastUpdateCheckAt: (timestamp) => {
        store.updateUI({ lastUpdateCheckAt: timestamp })
      },
      getPendingUpdateNudgeId: () => store.getUI().pendingUpdateNudgeId ?? null,
      setPendingUpdateNudgeId: (id) => {
        // Why: the nudge lifecycle is owned by the main process. When applying a
        // new campaign, persist the pending id AND clear the version dismissal
        // together so relaunches cannot resurrect the old hidden-card state
        // between nudge apply and renderer sync. When clearing (id is null),
        // only touch pendingUpdateNudgeId — clearing dismissedUpdateVersion here
        // would silently un-dismiss an update if the flow ever changes.
        if (id) {
          store.updateUI({ pendingUpdateNudgeId: id, dismissedUpdateVersion: null })
        } else {
          store.updateUI({ pendingUpdateNudgeId: null })
        }
      },
      setDismissedUpdateNudgeId: (id) => {
        store.updateUI({ dismissedUpdateNudgeId: id })
      }
    })
    logStartupMilestone('updater-setup-done')
  }
  pendingAutoUpdaterSetup = setupAutoUpdaterDeferred
  mainWindow.once('ready-to-show', () => setImmediate(setupAutoUpdaterDeferred))
  const updaterSetupFallback = setTimeout(setupAutoUpdaterDeferred, UPDATER_SETUP_FALLBACK_MS)
  updaterSetupFallback.unref?.()
  registerRuntimeWindowLifecycle(mainWindow, runtime)

  const allowedPermissions = new Set(['media', 'fullscreen', 'pointerLock'])
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      if (permission === 'media') {
        void requestSystemMediaAccess(details).then(callback, (error: unknown) => {
          console.error('[permissions] Failed to request media access:', error)
          callback(false)
        })
        return
      }
      callback(allowedPermissions.has(permission))
    }
  )
  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, _origin, details) => {
      if (permission !== 'media') {
        return allowedPermissions.has(permission)
      }
      return hasSystemMediaAccess(details?.mediaType)
    }
  )

  mainWindow.on('closed', () => {
    // Why: browser webviews are renderer-owned guest surfaces. Clearing
    // main-owned guest registrations on window close prevents stale
    // tab→webContents ids from leaking across app relaunch or hot-reload cycles.
    browserManager.unregisterAll()
  })
}

function registerAppReloadHandler(
  mainWindow: BrowserWindow,
  onBeforeRendererReload?: (args: { webContentsId: number; ignoreCache: boolean }) => void
): void {
  // Why: the process-global IPC handler can outlive the BrowserWindow, so keep
  // the registered WebContents and guard both lifetimes before using it.
  const handlerToken = ++appReloadHandlerTokenCounter
  activeAppReloadHandlerToken = handlerToken
  const mainWebContents = mainWindow.webContents
  ipcMain.removeHandler('app:reload')
  ipcMain.handle('app:reload', (event) => {
    if (
      mainWindow.isDestroyed() ||
      mainWebContents.isDestroyed() ||
      event.sender !== mainWebContents
    ) {
      return
    }
    onBeforeRendererReload?.({ webContentsId: mainWebContents.id, ignoreCache: false })
    mainWebContents.reload()
  })
  mainWindow.on('closed', () => {
    if (activeAppReloadHandlerToken !== handlerToken) {
      return
    }
    // Why: macOS can keep the process alive with no window, and this global
    // handler otherwise keeps the closed BrowserWindow reachable until reopen.
    ipcMain.removeHandler('app:reload')
    activeAppReloadHandlerToken = null
  })
}

function registerRuntimeWindowLifecycle(
  mainWindow: BrowserWindow,
  runtime: YiruRuntimeService
): void {
  const shellConnectionId = electronShellServicesConnectionId(mainWindow.webContents.id)
  runtime.attachWindow(mainWindow.id)
  const unsubscribeShellConnectionLifecycle = subscribeShellServicesConnectionLifecycle((event) => {
    if (event.shellConnectionId !== shellConnectionId) {
      return
    }
    switch (event.type) {
      case 'connected':
        runtime.attachShellConnection(shellConnectionId)
        break
      case 'disconnected':
        runtime.detachShellConnection(shellConnectionId)
        break
    }
  })
  // Why: the runtime must fail closed while the renderer graph is being torn
  // down or rebuilt, otherwise future CLI calls could act on stale terminal
  // mappings during reload transitions.
  mainWindow.webContents.on('did-start-loading', () => {
    runtime.markRendererReloading(mainWindow.id)
  })
  mainWindow.on('closed', () => {
    unsubscribeShellConnectionLifecycle()
    runtime.markGraphUnavailable(mainWindow.id)
    runtime.detachShellConnection(shellConnectionId)
  })
}

function registerFileDropRelay(mainWindow: BrowserWindow): void {
  const channel = 'terminal:file-dropped-from-preload'
  const mainWebContents = mainWindow.webContents
  ipcMain.removeAllListeners(channel)
  const relayFileDrop = (event: Electron.IpcMainEvent, args: NativeFileDropPayload): void => {
    if (
      mainWindow.isDestroyed() ||
      mainWebContents.isDestroyed() ||
      event.sender !== mainWebContents
    ) {
      return
    }
    if (!isNativeFileDropPayload(args)) {
      return
    }

    // Why: relay exactly one IPC event per drop gesture so the renderer
    // receives the full batch of paths without timer-based reconstruction.
    mainWindow.webContents.send('terminal:file-drop', args)
  }
  ipcMain.on(channel, relayFileDrop)
  mainWindow.on('closed', () => {
    // Why: macOS can keep the app process alive after the window closes; drop
    // the relay closure so a destroyed BrowserWindow is not retained.
    ipcMain.removeListener(channel, relayFileDrop)
  })
}

export function registerUpdaterHandlers(_store: Store): void {
  ipcMain.removeHandler('updater:getStatus')
  ipcMain.removeHandler('updater:getVersion')
  ipcMain.removeHandler('updater:check')
  ipcMain.removeHandler('updater:download')
  ipcMain.removeHandler('updater:quitAndInstall')
  ipcMain.removeHandler('updater:dismissNudge')

  ipcMain.handle('updater:getStatus', () => getUpdateStatus())
  ipcMain.handle('updater:getVersion', () => app.getVersion())
  ipcMain.handle('updater:check', (_event, options?: UpdateCheckOptions) => {
    ensureAutoUpdaterConfigured()
    return checkForUpdatesFromMenu(options)
  })
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:quitAndInstall', () => quitAndInstall())
  ipcMain.handle('updater:dismissNudge', () => dismissNudge())
}
