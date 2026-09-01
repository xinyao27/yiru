import { shellClient } from '~renderer/runtime/shell-client'
/**
 * Apply a UI zoom level change and update the matching CSS scale variable.
 */
export function applyUIZoom(level: number): void {
  const zoomFactor = Math.pow(1.2, level)
  shellClient.ui.setZoomLevel(level)
  document.documentElement.style.setProperty('--ui-zoom-factor', String(zoomFactor))
}

/**
 * Sync the CSS variable with the current webFrame zoom level.
 * Call on startup after the main process has restored the zoom.
 */
export function syncZoomCSSVar(): void {
  const level = shellClient.ui.getZoomLevel()
  const zoomFactor = Math.pow(1.2, level)
  document.documentElement.style.setProperty('--ui-zoom-factor', String(zoomFactor))
}
