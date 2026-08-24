import {
  type BrowserAnnotationViewportBridgeOptions,
  buildBrowserAnnotationViewportBridgeScript
} from '~shared/browser/annotation-viewport-bridge'
import type {
  BrowserGrabCancelReason,
  BrowserGrabPayload,
  BrowserGrabRect,
  BrowserGrabResult,
  BrowserGrabScreenshot
} from '~shared/browser/grab-types'
import type { BrowserViewportOverride } from '~shared/types'

import { buildGuestOverlayScript } from './grab-guest-script'
import { clampGrabPayload } from './grab-payload'
import { captureSelectionScreenshot as captureGrabSelectionScreenshot } from './grab-screenshot'
import { BrowserManagerDownloads } from './manager-downloads'
import { buildMobileUserAgent, extractChromeMajor } from './manager-foundation'
import { evaluateBrowserPage, evaluateBrowserPageIsolated } from './page/evaluation'
import type { BrowserPageCdpLease, BrowserPageHandle } from './page/handle'
import { cleanElectronUserAgent } from './session-ua'

export abstract class BrowserManagerViewport extends BrowserManagerDownloads {
  async openDevTools(browserTabId: string): Promise<boolean> {
    const page = this.pageRegistry.get(browserTabId)
    if (!page?.openDevTools) {
      return false
    }
    page.openDevTools()
    return true
  }

  // Why: Electron <webview> guests do not expose Chrome DevTools' device
  // toolbar (Cmd+Shift+M) to the embedding app, so viewport emulation must be
  // driven through CDP directly. We reuse the debugger attachment that
  // injectGuestDocumentScripts already established and never detach it here — doing
  // so would clear Page.addScriptToEvaluateOnNewDocument and other per-guest
  // overrides. Passing override=null clears emulation.
  async setViewportOverride(
    browserTabId: string,
    override: BrowserViewportOverride | null
  ): Promise<boolean> {
    // Why: chain per-tab so rapid toggles (e.g. user clicking presets quickly)
    // don't interleave CDP commands. Each call waits for the previous one to
    // settle, guaranteeing the last-requested override wins rather than whichever
    // sendCommand sequence happens to finish last.
    const prev = this.viewportOpsByTabId.get(browserTabId) ?? Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(() => this.doSetViewportOverrideImpl(browserTabId, override))
    this.viewportOpsByTabId.set(browserTabId, next)
    try {
      return await next
    } finally {
      // Why: only clear if this call's promise is still the tail. A concurrent
      // later call may have already replaced the entry; deleting would drop the
      // chain and break serialization for the next invocation.
      if (this.viewportOpsByTabId.get(browserTabId) === next) {
        this.viewportOpsByTabId.delete(browserTabId)
      }
    }
  }

  async setAnnotationViewportBridge(
    browserTabId: string,
    options: BrowserAnnotationViewportBridgeOptions
  ): Promise<boolean> {
    const prev = this.annotationViewportBridgeOpsByTabId.get(browserTabId) ?? Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(() => this.doSetAnnotationViewportBridgeImpl(browserTabId, options))
    this.annotationViewportBridgeOpsByTabId.set(browserTabId, next)
    try {
      return await next
    } finally {
      if (this.annotationViewportBridgeOpsByTabId.get(browserTabId) === next) {
        this.annotationViewportBridgeOpsByTabId.delete(browserTabId)
      }
    }
  }

  protected async doSetAnnotationViewportBridgeImpl(
    browserTabId: string,
    options: BrowserAnnotationViewportBridgeOptions
  ): Promise<boolean> {
    const page = this.pageRegistry.get(browserTabId)
    if (!page) {
      return false
    }
    try {
      // Why: the scroll bridge runs outside the page world so page monkey
      // patches cannot read the per-tab token or tamper with bridge state.
      await evaluateBrowserPageIsolated(page, buildBrowserAnnotationViewportBridgeScript(options))
      return true
    } catch {
      return false
    }
  }

  protected async doSetViewportOverrideImpl(
    browserTabId: string,
    override: BrowserViewportOverride | null
  ): Promise<boolean> {
    const page = this.pageRegistry.get(browserTabId)
    if (!page) {
      return false
    }
    let dbg: BrowserPageCdpLease
    try {
      dbg = page.acquireCdp()
    } catch (err) {
      // Why: DevTools being open on the guest causes attach to throw with
      // "Another debugger is already attached". Silently returning false made
      // this failure mode undiagnosable — surface it via the logger with enough
      // context (tab + webContents ids) to correlate with user reports.
      console.warn('[browser-manager] setViewportOverride: failed to attach debugger', {
        browserTabId,
        backendPageId: page.identity.backendPageId,
        error: err instanceof Error ? err.message : String(err)
      })
      return false
    }

    try {
      if (override) {
        await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
          width: override.width,
          height: override.height,
          deviceScaleFactor: override.deviceScaleFactor,
          mobile: override.mobile
        })
        await dbg.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: override.mobile,
          maxTouchPoints: override.mobile ? 5 : 0
        })
        if (override.mobile) {
          const chromeMajor = extractChromeMajor(cleanElectronUserAgent(page.getUserAgent()))
          // Why: pass userAgentMetadata alongside the mobile UA string so
          // sec-ch-ua-mobile / sec-ch-ua-platform client hints match. Without
          // it, session-level desktop client-hints leak through and create a
          // UA/CH mismatch that bot-detection (Cloudflare, Turnstile) flags.
          await dbg.sendCommand('Emulation.setUserAgentOverride', {
            userAgent: buildMobileUserAgent(chromeMajor),
            userAgentMetadata: {
              brands: [
                { brand: 'Google Chrome', version: chromeMajor },
                { brand: 'Chromium', version: chromeMajor },
                { brand: 'Not/A)Brand', version: '24' }
              ],
              fullVersionList: [
                { brand: 'Google Chrome', version: `${chromeMajor}.0.0.0` },
                { brand: 'Chromium', version: `${chromeMajor}.0.0.0` },
                { brand: 'Not/A)Brand', version: '24.0.0.0' }
              ],
              fullVersion: `${chromeMajor}.0.0.0`,
              platform: 'iOS',
              platformVersion: '17.0',
              architecture: '',
              model: 'iPhone',
              mobile: true
            }
          })
        } else {
          // Why: desktop presets still need the clean (non-Electron) UA so
          // Cloudflare/Turnstile don't flag the session. Passing the cleaned
          // real UA keeps sec-ch-ua consistent with the override.
          await dbg.sendCommand('Emulation.setUserAgentOverride', {
            userAgent: cleanElectronUserAgent(page.getUserAgent())
          })
        }
      } else {
        await dbg.sendCommand('Emulation.clearDeviceMetricsOverride', {})
        await dbg.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: false,
          maxTouchPoints: 0
        })
        // Why: passing an empty string restores the session default UA.
        await dbg.sendCommand('Emulation.setUserAgentOverride', { userAgent: '' })
      }
      return true
    } catch {
      return false
    } finally {
      dbg.release()
    }
  }

  // ---------------------------------------------------------------------------
  // Browser Context Grab — main-owned operations
  // ---------------------------------------------------------------------------

  /** Validates that an opaque shell connection owns the registered page. */
  getAuthorizedPage(browserTabId: string, shellConnectionId: string): BrowserPageHandle | null {
    const page = this.pageRegistry.get(browserTabId)
    if (!page || page.identity.shellConnectionId !== shellConnectionId) {
      return null
    }
    return page
  }

  /** Returns true if a grab operation is currently active for this tab. */
  hasActiveGrabOp(browserTabId: string): boolean {
    return this.grabSessionController.hasActiveGrabOp(browserTabId)
  }

  /**
   * Enable or disable grab mode for a browser tab. When enabled, injects the
   * overlay runtime into the guest. When disabled, cancels any active grab op.
   */
  async setGrabMode(
    browserTabId: string,
    enabled: boolean,
    page: BrowserPageHandle
  ): Promise<boolean> {
    if (!enabled) {
      this.cancelGrabOp(browserTabId, 'user')
      return true
    }
    // Why: injecting the overlay runtime eagerly on arm lets the hover UI
    // appear instantly when the user starts moving the pointer, rather than
    // adding a visible delay between "click Grab" and "overlay appears".
    // The runtime is idempotent — re-injection on the same page is safe.
    try {
      await evaluateBrowserPage(page, buildGuestOverlayScript('arm'))
      return true
    } catch {
      return false
    }
  }

  /**
   * Await a single grab selection on the given tab. Returns a Promise that
   * resolves exactly once when the user clicks, cancels, or an error occurs.
   *
   * Why the click is handled in-guest rather than via main-side interception:
   * Electron's `before-input-event` only fires for keyboard events, not mouse
   * events on guest webContents. The design doc anticipated a main-owned
   * interceptor, but the spike showed this API gap. The fallback (documented
   * in the design doc) is to let the guest overlay's full-viewport hit-catcher
   * consume the click. The overlay calls `stopPropagation()` and
   * `preventDefault()` so the page underneath does not receive the event.
   * This is not a perfect guarantee (capture-phase listeners on window may
   * still fire), but it covers the vast majority of sites.
   */
  awaitGrabSelection(
    browserTabId: string,
    opId: string,
    page: BrowserPageHandle
  ): Promise<BrowserGrabResult> {
    return this.grabSessionController.awaitGrabSelection(browserTabId, opId, page)
  }

  /**
   * Cancel an active grab operation for the given tab.
   */
  cancelGrabOp(browserTabId: string, reason: BrowserGrabCancelReason): void {
    this.grabSessionController.cancelGrabOp(browserTabId, reason)
  }

  /**
   * Capture a screenshot of the guest surface and optionally crop it to
   * the given CSS-pixel rect.
   */
  async captureSelectionScreenshot(
    _browserTabId: string,
    rect: BrowserGrabRect,
    page: BrowserPageHandle
  ): Promise<BrowserGrabScreenshot | null> {
    return captureGrabSelectionScreenshot(rect, page)
  }

  /**
   * Extract the payload for the currently hovered element without disrupting
   * the active grab overlay or awaitClick listener. Used by keyboard shortcuts
   * that let the user copy content while hovering, before clicking.
   */
  async extractHoverPayload(
    _browserTabId: string,
    page: BrowserPageHandle
  ): Promise<BrowserGrabPayload | null> {
    try {
      const rawPayload = await evaluateBrowserPage(page, buildGuestOverlayScript('extractHover'))
      if (!rawPayload || typeof rawPayload !== 'object') {
        return null
      }
      return clampGrabPayload(rawPayload)
    } catch {
      return null
    }
  }
}
