import type {
  BrowserDownloadFinishedEvent,
  BrowserDownloadProgressEvent,
  BrowserPermissionDeniedEvent,
  BrowserPopupEvent
} from '~shared/browser/guest-events'
import { normalizeExternalBrowserUrl } from '~shared/browser/url'

import type { BrowserDownloadItem } from './session'

export const AUTOMATION_VISIBILITY_ACQUIRE_TIMEOUT_MS = 2_000

export function isChromiumInternalErrorUrl(url: string): boolean {
  return url.startsWith('chrome-error://')
}

export function resolveWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<{ value: T; timedOut: boolean }> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ value: fallbackValue, timedOut: true }), timeoutMs)
  })
  return Promise.race([
    promise.then((value) => ({ value, timedOut: false })),
    timeoutPromise
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

export function releaseAutomationVisibilityToken(
  renderer: Electron.WebContents,
  token: string
): void {
  if (renderer.isDestroyed()) {
    return
  }
  renderer
    .executeJavaScript(
      `(function() {
        var bridge = window.__yiruBrowserAutomationVisibility;
        if (!bridge || typeof bridge.release !== 'function') return false;
        return bridge.release(${JSON.stringify(token)});
      })()`
    )
    .catch(() => {})
}

export function cleanupLateAutomationVisibilityToken(
  renderer: Electron.WebContents,
  acquirePromise: Promise<unknown>
): void {
  acquirePromise
    .then((lateToken) => {
      if (typeof lateToken !== 'string' || lateToken.length === 0) {
        return
      }
      // Why: the renderer creates the lease before waiting for paint; if main's
      // acquire timeout wins, release the eventual token so hidden webviews do
      // not stay paintable indefinitely.
      releaseAutomationVisibilityToken(renderer, lateToken)
    })
    .catch(() => {})
}

export function createNoopRestoreForTimedOutAutomationAcquire(
  renderer: Electron.WebContents,
  acquirePromise: Promise<unknown>,
  timedOut: boolean
): () => void {
  if (timedOut) {
    cleanupLateAutomationVisibilityToken(renderer, acquirePromise)
  }
  return () => {}
}

export function isAutomationVisibilityToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0
}

// Why: mobile presets need a touch-capable UA or responsive sites serve the
// desktop variant based on UA sniffing. This is the Chrome DevTools default
// iPhone UA template; we splice in the guest session's real Chrome major so
// sec-ch-ua headers (see setupClientHintsOverride) stay consistent.
export function buildMobileUserAgent(chromeMajor: string): string {
  return `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${chromeMajor}.0.0.0 Mobile/15E148 Safari/604.1`
}

export function extractChromeMajor(ua: string): string {
  const match = ua.match(/Chrome\/(\d+)/)
  return match ? match[1] : '134'
}

export type BrowserGuestRegistration = {
  browserPageId?: string
  browserTabId?: string
  workspaceId?: string
  worktreeId?: string
  sessionProfileId?: string | null
  backendPageId: string
  rendererOwnerId: string
  shellConnectionId: string
}

export type PendingPermissionEvent = Omit<BrowserPermissionDeniedEvent, 'browserPageId'>
export type PendingPopupEvent = Omit<BrowserPopupEvent, 'browserPageId'>
export type BrowserDownloadDoneState = 'completed' | 'cancelled' | 'interrupted'
export type PopupOwnerContext = {
  browserTabId: string
  rootGuestWebContentsId: number
}
export const SAFE_POPUP_WINDOW_OPTIONS = {
  alwaysOnTop: false,
  closable: true,
  focusable: true,
  frame: true,
  fullscreen: false,
  kiosk: false,
  modal: false,
  movable: true,
  opacity: 1,
  show: true,
  simpleFullscreen: false,
  skipTaskbar: false,
  titleBarStyle: 'default',
  transparent: false,
  // Why: applied by Electron when it creates the popup's WebContents, before
  // createWindow runs. Feature strings and opener inheritance must not be able
  // to relax the child's process isolation.
  webPreferences: {
    allowRunningInsecureContent: false,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webviewTag: false
  }
} satisfies Electron.BrowserWindowConstructorOptions

export type ActiveDownload = {
  downloadId: string
  guestWebContentsId: number
  browserTabId: string | null
  rendererWebContentsId: number | null
  origin: string
  filename: string
  totalBytes: number | null
  mimeType: string | null
  item: BrowserDownloadItem
  savePath: string
  reservationKey: string | null
  receivedBytes: number
  transientState: BrowserDownloadProgressEvent['state']
  terminalEvent: BrowserDownloadFinishedEvent | null
  startedSent: boolean
  cleanup: (() => void) | null
}

export function safeOrigin(rawUrl: string): string {
  const external = normalizeExternalBrowserUrl(rawUrl)
  const urlToParse = external ?? rawUrl
  try {
    return new URL(urlToParse).origin
  } catch {
    return external ?? 'unknown'
  }
}
