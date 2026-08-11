import type { ShellEvent } from '@yiru/runtime-protocol/contract'
import { BrowserWindow } from 'electron'

import { publishShellEvent } from './events'

export function broadcastShellEvent(event: ShellEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      publishShellEvent(window.webContents.id, event)
    }
  }
}
