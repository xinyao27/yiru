import { resolveAuthorizedPath } from '~main/filesystem/auth'
import type { RuntimeWindowTarget } from '~main/runtime/host/renderer-target'
import type {
  RuntimeBrowserCommandHost,
  RuntimeBrowserCommands
} from '~main/runtime/yiru-runtime-browser'

import { RuntimeTerminalDeliverPendingMessages } from '../terminal/deliver-pending-messages'

export abstract class RuntimeBrowserBrowserCommands extends RuntimeTerminalDeliverPendingMessages {
  get browserCommands(): RuntimeBrowserCommands {
    return this.browserCommandsValue
  }

  protected createBrowserCommandHost(): RuntimeBrowserCommandHost {
    return {
      emitBrowserGuestEvent: (event) => this.emitBrowserGuestEvent(event),
      getAgentBrowserBridge: () => this.agentBrowserBridge,
      resolveWorktreeSelector: (selector) => this.resolveWorktreeSelector(selector),
      resolveBrowserFilePath: (path) => resolveAuthorizedPath(path, this.requireStore()),
      getAuthoritativeWindow: () => this.getAuthoritativeWindow(),
      getAvailableAuthoritativeWindow: () => this.getAvailableAuthoritativeWindow(),
      getBrowserBackend: () => this.browserBackend,
      // Why: a hand-listed wrapper previously dropped targetGroupId, so preserve
      // the browser module's full activation interface at the composition seam.
      markHeadlessBrowserSessionTabActive: this.markHeadlessBrowserSessionTabActive.bind(this),
      registerSubscriptionCleanup: (subscriptionId, cleanup, connectionId) =>
        this.registerSubscriptionCleanup(subscriptionId, cleanup, connectionId),
      cleanupSubscription: (subscriptionId) => this.cleanupSubscription(subscriptionId),
      notifyBrowserDriverChanged: (browserPageId, driver) => {
        this.emitDriverEvent({ type: 'browserDriverChanged', browserPageId, driver })
      }
    }
  }

  protected getAuthoritativeWindow(): RuntimeWindowTarget {
    const win = this.getAvailableAuthoritativeWindow()
    if (!win || win.isDestroyed()) {
      throw new Error('No renderer window available')
    }
    return win
  }

  protected getAvailableAuthoritativeWindow(): RuntimeWindowTarget | null {
    const windowId = this.terminalSessions.getAuthoritativeWindowId()
    if (windowId === null) {
      return null
    }
    const win = this.getWindowByIdFn(windowId)
    return win && !win.isDestroyed() ? win : null
  }
}
