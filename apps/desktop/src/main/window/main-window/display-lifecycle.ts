import { app, powerMonitor, type BrowserWindow } from 'electron'
import type { Store } from '~main/persistence'
import { publishShellEvent } from '~main/shell/events'

import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from './creation'
import { forceWindowRepaint, syncTrafficLightPosition } from './visual'

export type WindowBoundsController = {
  isClosing: () => boolean
  freeze: () => void
  release: () => void
}

export function registerWindowDisplayLifecycle(
  mainWindow: BrowserWindow,
  store: Store | null,
  savedMaximized: boolean
): WindowBoundsController {
  if (process.platform === 'darwin') {
    // Why: persistent webview compositor layers can remain black after restore
    // on macOS, so visibility transitions explicitly invalidate the surface.
    mainWindow.webContents.setBackgroundThrottling(false)
    mainWindow.on('restore', () => forceWindowRepaint(mainWindow))
    mainWindow.on('show', () => forceWindowRepaint(mainWindow))
  }

  const onSystemResume = (): void => {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed?.() === true) {
      return
    }
    forceWindowRepaint(mainWindow)
    publishShellEvent(mainWindow.webContents.id, { type: 'uiSystemResumed' })
  }
  powerMonitor.on('resume', onSystemResume)

  mainWindow.webContents.on('dom-ready', () => {
    const level = store?.getUI().uiZoomLevel ?? 0
    mainWindow.webContents.setZoomLevel(level)
    syncTrafficLightPosition(mainWindow, Math.pow(1.2, level))
  })

  let handledInitialReveal = false
  let revealTimer: ReturnType<typeof setTimeout> | null =
    process.platform === 'win32' || process.platform === 'linux'
      ? setTimeout(revealInitialWindow, 10_000)
      : null
  revealTimer?.unref?.()

  function clearRevealTimer(): void {
    if (revealTimer) {
      clearTimeout(revealTimer)
      revealTimer = null
    }
  }

  function revealInitialWindow(): void {
    if (mainWindow.isDestroyed()) {
      clearRevealTimer()
      return
    }
    if (handledInitialReveal) {
      return
    }
    handledInitialReveal = true
    clearRevealTimer()
    if (savedMaximized) {
      mainWindow.maximize()
    }
    mainWindow.show()
  }
  mainWindow.on('ready-to-show', revealInitialWindow)

  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  let windowClosing = false

  const clearBoundsTimer = (): void => {
    if (boundsTimer) {
      clearTimeout(boundsTimer)
      boundsTimer = null
    }
  }
  const freeze = (): void => {
    windowClosing = true
    clearBoundsTimer()
  }
  const release = (): void => {
    windowClosing = false
  }
  const persistBounds = (): void => {
    clearBoundsTimer()
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (windowClosing || mainWindow.isDestroyed() || mainWindow.isFullScreen()) {
        return
      }
      if (mainWindow.isMaximized()) {
        store?.updateUI({ windowMaximized: true })
        return
      }
      const bounds = mainWindow.getBounds()
      if (bounds.width <= MIN_WINDOW_WIDTH || bounds.height <= MIN_WINDOW_HEIGHT) {
        console.warn('[window] Skipping persist of near-minimum windowBounds:', bounds)
        store?.updateUI({ windowMaximized: false })
        return
      }
      store?.updateUI({ windowMaximized: false, windowBounds: bounds })
    }, 500)
  }

  mainWindow.on('resize', persistBounds)
  mainWindow.on('move', persistBounds)
  app.on('before-quit', freeze)
  mainWindow.on('maximize', () => {
    if (!windowClosing) {
      store?.updateUI({ windowMaximized: true })
      publishShellEvent(mainWindow.webContents.id, { type: 'uiMaximizeChanged', isMaximized: true })
    }
  })
  mainWindow.on('unmaximize', () => {
    if (windowClosing) {
      return
    }
    publishShellEvent(mainWindow.webContents.id, { type: 'uiMaximizeChanged', isMaximized: false })
    const bounds = mainWindow.getBounds()
    if (bounds.width <= MIN_WINDOW_WIDTH || bounds.height <= MIN_WINDOW_HEIGHT) {
      console.warn('[window] Skipping unmaximize-time persist of near-min bounds:', bounds)
      store?.updateUI({ windowMaximized: false })
      return
    }
    store?.updateUI({ windowMaximized: false, windowBounds: bounds })
  })
  mainWindow.on('enter-full-screen', () => {
    publishShellEvent(mainWindow.webContents.id, {
      type: 'uiFullscreenChanged',
      isFullScreen: true
    })
  })
  mainWindow.on('leave-full-screen', () => {
    publishShellEvent(mainWindow.webContents.id, {
      type: 'uiFullscreenChanged',
      isFullScreen: false
    })
  })
  mainWindow.on('closed', () => {
    clearRevealTimer()
    clearBoundsTimer()
    powerMonitor.removeListener('resume', onSystemResume)
    app.removeListener('before-quit', freeze)
  })

  return { isClosing: () => windowClosing, freeze, release }
}
