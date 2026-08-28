import type { RuntimeWindowTarget } from '~main/runtime/host/renderer-target'

import { RuntimeTerminalDeliverPendingMessages } from '../terminal/deliver-pending-messages'

export abstract class RuntimeWindowAuthoritativeWindow extends RuntimeTerminalDeliverPendingMessages {
  protected getAuthoritativeWindow(): RuntimeWindowTarget {
    const window = this.getAvailableAuthoritativeWindow()
    if (!window || window.isDestroyed()) {
      throw new Error('renderer_window_unavailable')
    }
    return window
  }

  protected getAvailableAuthoritativeWindow(): RuntimeWindowTarget | null {
    const windowId = this.terminalSessions.getAuthoritativeWindowId()
    if (windowId === null) {
      return null
    }
    const window = this.getWindowByIdFn(windowId)
    return window && !window.isDestroyed() ? window : null
  }
}
