import type { BrowserWindow } from 'electron'

const TITLEBAR_CSS_CENTER = 19
const TRAFFIC_LIGHT_RADIUS = 6

export const TRAFFIC_LIGHT_X = 16

export function forceWindowRepaint(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return
  }
  window.webContents.invalidate()
  if (window.isMaximized() || window.isFullScreen()) {
    return
  }
  const [width, height] = window.getSize()
  window.setSize(width + 1, height)
  setTimeout(() => {
    if (!window.isDestroyed()) {
      window.setSize(width, height)
    }
  }, 32)
}

export function getInitialTrafficLightPosition(): { x: number; y: number } {
  return { x: TRAFFIC_LIGHT_X, y: TITLEBAR_CSS_CENTER - TRAFFIC_LIGHT_RADIUS }
}

export function syncTrafficLightPosition(window: BrowserWindow, zoomFactor: number): void {
  if (process.platform !== 'darwin' || window.isDestroyed()) {
    return
  }
  const y = Math.round(TITLEBAR_CSS_CENTER * zoomFactor - TRAFFIC_LIGHT_RADIUS)
  window.setWindowButtonPosition({ x: TRAFFIC_LIGHT_X, y })
}
