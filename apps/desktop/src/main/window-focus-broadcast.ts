import { app, type BrowserWindow, type Event } from 'electron'

import { publishShellEvent } from './shell/events'

// Why: activating a macOS app does not emit a renderer DOM focus event, so
// refresh work that depends on returning to Yiru needs this shell signal.
export function registerWindowFocusBroadcast(): () => void {
  const onWindowFocused = (_event: Event, window: BrowserWindow): void => {
    if (!window.isDestroyed()) {
      publishShellEvent(window.webContents.id, { type: 'uiWindowFocused' })
    }
  }
  app.on('browser-window-focus', onWindowFocused)
  return () => {
    app.off('browser-window-focus', onWindowFocused)
  }
}
