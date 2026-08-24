import { release } from 'node:os'
import { join } from 'node:path'

import { BrowserWindow, nativeTheme, screen } from 'electron'
import { getAppIconPath } from '~main/app-icon'
import type { Store } from '~main/persistence'
import { supportsNativeSidebarMaterial } from '~shared/native-sidebar-material-support'

import type { CreateMainWindowOptions } from './model'
import { getInitialTrafficLightPosition } from './visual'

export const MIN_WINDOW_WIDTH = 600
export const MIN_WINDOW_HEIGHT = 400

type WindowCreation = {
  mainWindow: BrowserWindow
  savedMaximized: boolean
}

function rectHasVisibleAreaOnAnyDisplay(bounds: {
  x: number
  y: number
  width: number
  height: number
}): boolean {
  try {
    return screen.getAllDisplays().some((display) => {
      const workArea = display.workArea
      const overlapX = Math.max(
        0,
        Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
          Math.max(bounds.x, workArea.x)
      )
      const overlapY = Math.max(
        0,
        Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
          Math.max(bounds.y, workArea.y)
      )
      return overlapX >= MIN_WINDOW_WIDTH / 2 && overlapY >= MIN_WINDOW_HEIGHT / 2
    })
  } catch (error) {
    console.warn('[window] screen.getAllDisplays() threw; treating bounds as off-screen', error)
    return false
  }
}

function getDefaultBounds(): { width: number; height: number } {
  try {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    return { width, height }
  } catch {
    return { width: 1200, height: 800 }
  }
}

export function createBrowserWindow(
  store: Store | null,
  options?: CreateMainWindowOptions
): WindowCreation {
  const rawSavedBounds = store?.getUI().windowBounds
  // Why: reject minimum-size or off-screen persisted bounds so a display change
  // or teardown resize cannot resurrect an unreachable window.
  const savedBounds =
    rawSavedBounds &&
    rawSavedBounds.width > MIN_WINDOW_WIDTH &&
    rawSavedBounds.height > MIN_WINDOW_HEIGHT &&
    rectHasVisibleAreaOnAnyDisplay(rawSavedBounds)
      ? rawSavedBounds
      : undefined
  if (rawSavedBounds && !savedBounds) {
    console.warn(
      '[window] Discarding persisted windowBounds and falling back to defaultBounds:',
      rawSavedBounds
    )
  }

  const defaultBounds = getDefaultBounds()
  const settings = store?.getSettings()
  const blur = settings?.windowBackgroundBlur ?? false
  const nativeSidebarMaterial = supportsNativeSidebarMaterial(process.platform, release())
  const platformBlurOptions = nativeSidebarMaterial
    ? process.platform === 'darwin'
      ? {
          vibrancy: blur ? ('under-window' as const) : ('sidebar' as const),
          visualEffectState: 'followWindow' as const,
          transparent: true
        }
      : { backgroundMaterial: 'acrylic' as const }
    : {}

  const mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? defaultBounds.width,
    height: savedBounds?.height ?? defaultBounds.height,
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: options?.title ?? 'Yiru',
    show: false,
    acceptFirstMouse: true,
    autoHideMenuBar: true,
    backgroundColor:
      nativeSidebarMaterial && process.platform === 'darwin'
        ? '#00000000'
        : nativeTheme.shouldUseDarkColors
          ? '#0a0a0a'
          : '#ffffff',
    titleBarStyle:
      process.platform === 'darwin'
        ? 'hiddenInset'
        : process.platform === 'win32'
          ? 'hidden'
          : undefined,
    ...(process.platform === 'linux' ? { frame: false } : {}),
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: getInitialTrafficLightPosition() }
      : {}),
    icon: getAppIconPath(settings?.appIcon),
    ...platformBlurOptions,
    webPreferences: {
      preload: join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: true
    }
  })

  return {
    mainWindow,
    savedMaximized: store?.getUI().windowMaximized ?? false
  }
}
