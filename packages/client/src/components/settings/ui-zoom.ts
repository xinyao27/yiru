import { shellClient } from '~renderer/runtime/shell-client'
const isMac = navigator.userAgent.includes('Mac')

/**
 * Apply a UI zoom level change through the shell UI contract,
 * updates the CSS variable used to compensate the traffic-light pad,
 * and repositions the native macOS traffic lights to stay aligned.
 */
export function applyUIZoom(level: number): void {
  const zoomFactor = Math.pow(1.2, level)
  shellClient.ui.setZoomLevel(level)
  document.documentElement.style.setProperty('--ui-zoom-factor', String(zoomFactor))
  if (isMac) {
    shellClient.ui.syncTrafficLights(zoomFactor)
  }
}

/**
 * Sync the CSS variable with the current webFrame zoom level.
 * Call on startup after the main process has restored the zoom.
 */
export function syncZoomCSSVar(): void {
  const level = shellClient.ui.getZoomLevel()
  const zoomFactor = Math.pow(1.2, level)
  document.documentElement.style.setProperty('--ui-zoom-factor', String(zoomFactor))
  if (isMac) {
    shellClient.ui.syncTrafficLights(zoomFactor)
  }
}
