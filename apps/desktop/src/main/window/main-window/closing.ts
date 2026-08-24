import { Menu, Notification, type BrowserWindow } from 'electron'
import { translateMain } from '~main/i18n/main-i18n'
import type { Store } from '~main/persistence'
import { publishShellEvent } from '~main/shell/events'
import { registerShellWindowUi } from '~main/shell/ui'

import { resolveWindowCloseAction } from '../close-decision'
import type { WindowBoundsController } from './display-lifecycle'
import type { CreateMainWindowOptions } from './model'
import type { RendererLifecycle, WindowFocusSurface } from './renderer-lifecycle'
import { syncTrafficLightPosition } from './visual'

function createHideToTray(
  mainWindow: BrowserWindow,
  store: Store | null,
  options: CreateMainWindowOptions | undefined,
  renderer: RendererLifecycle
): () => boolean {
  return () => {
    const isRendererCrashed = mainWindow.webContents.isCrashed?.() ?? false
    if (
      process.platform !== 'win32' ||
      renderer.hasProcessGone() ||
      isRendererCrashed ||
      options?.getIsQuitting?.() === true ||
      store?.getSettings().minimizeToTrayOnClose !== true
    ) {
      return false
    }
    mainWindow.hide()
    if (store && store.getUI().trayMinimizeNoticeShown !== true) {
      try {
        new Notification({
          title: 'Yiru',
          body: translateMain(
            'tray.minimizeNotice.body',
            'Yiru is still running in the system tray'
          )
        }).show()
      } catch {
        // Why: notification failure must never block the requested tray hide.
      }
      store.updateUI({ trayMinimizeNoticeShown: true })
    }
    return true
  }
}

export function registerWindowClosing(
  mainWindow: BrowserWindow,
  store: Store | null,
  options: CreateMainWindowOptions | undefined,
  bounds: WindowBoundsController,
  renderer: RendererLifecycle
): void {
  let windowCloseConfirmed = false
  const hideToTrayIfEnabled = createHideToTray(mainWindow, store, options, renderer)

  mainWindow.on('close', (event) => {
    if (!windowCloseConfirmed && hideToTrayIfEnabled()) {
      event.preventDefault()
      return
    }
    const closeAction = resolveWindowCloseAction({
      windowCloseConfirmed,
      rendererProcessGone: renderer.hasProcessGone(),
      isRendererCrashed: mainWindow.webContents.isCrashed?.() ?? false
    })
    if (closeAction !== 'request-confirmation') {
      if (closeAction === 'allow-confirmed') {
        windowCloseConfirmed = false
      }
      bounds.freeze()
      return
    }
    event.preventDefault()
    publishShellEvent(mainWindow.webContents.id, {
      type: 'uiWindowCloseRequested',
      isQuitting: options?.getIsQuitting?.() ?? false
    })
  })
  mainWindow.webContents.on('will-prevent-unload', () => {
    bounds.release()
    options?.onQuitAborted?.()
  })

  const requestClose = (): void => {
    if (mainWindow.isDestroyed() || hideToTrayIfEnabled()) {
      return
    }
    publishShellEvent(mainWindow.webContents.id, {
      type: 'uiWindowCloseRequested',
      isQuitting: false
    })
  }
  const setFocus =
    (surface: WindowFocusSurface) =>
    (focused: boolean): void => {
      renderer.setFocus(surface, focused)
    }
  const unregisterWindowUi = registerShellWindowUi(mainWindow.webContents.id, {
    syncTrafficLights: (zoomFactor) => syncTrafficLightPosition(mainWindow, zoomFactor),
    setMarkdownEditorFocused: setFocus('markdownEditor'),
    setTerminalInputFocused: setFocus('terminalInput'),
    setShortcutRecorderFocused: setFocus('shortcutRecorder'),
    minimize: () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.minimize()
      }
    },
    maximize: () => {
      if (mainWindow.isDestroyed()) {
        return
      }
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    },
    isMaximized: () => !mainWindow.isDestroyed() && mainWindow.isMaximized(),
    isFullScreen: () => !mainWindow.isDestroyed() && mainWindow.isFullScreen(),
    requestClose,
    popupMenu: () => Menu.getApplicationMenu()?.popup({ window: mainWindow }),
    confirmWindowClose: () => {
      windowCloseConfirmed = true
      if (!mainWindow.isDestroyed()) {
        mainWindow.close()
      }
    }
  })
  mainWindow.on('closed', unregisterWindowUi)
}
