import {
  createBrowserWebviewElement,
  type BrowserWebviewElement
} from '~renderer/runtime/browser-webview-element'
import {
  destroyPersistentWebview,
  registerPersistentWebview,
  webviewRegistry
} from '~renderer/runtime/browser-webview-registry'
import { YIRU_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '~shared/browser/guest-web-preferences'

export function navigateBrowserPageWebview(webview: BrowserWebviewElement, url: string): void {
  webview.src = url
}

export function setBrowserPageWebviewInputLocked(
  webview: BrowserWebviewElement,
  inputLocked: boolean
): void {
  webview.style.pointerEvents = inputLocked ? 'none' : 'auto'
}

export function setBrowserPageWebviewFailureHidden(
  webview: BrowserWebviewElement,
  hidden: boolean
): void {
  // Why: Electron webviews paint in a native compositor layer, so CSS visibility
  // can leave a black guest above React's failure overlay on some Electron builds.
  webview.style.display = hidden ? 'none' : 'flex'
}

export function ensureBrowserPageWebview({
  browserTabId,
  container,
  inputLocked,
  webviewPartition,
  resolveContainer
}: {
  browserTabId: string
  container: HTMLDivElement
  inputLocked: boolean
  webviewPartition: string
  resolveContainer: () => HTMLDivElement | null
}): { container: HTMLDivElement; created: boolean; webview: BrowserWebviewElement } | null {
  let webview = webviewRegistry.get(browserTabId)
  let created = false
  let activeContainer = container

  // Why: a persisted guest must be torn down and rebuilt when its DOM parent
  // drifted (moving a <webview> across parents can recreate the guest document)
  // or when its partition no longer matches — Electron partitions are immutable
  // after creation, so reuse would keep the stale session. Re-resolve the
  // viewport container the teardown may have detached; bail if it is gone.
  if (
    webview &&
    (webview.parentElement !== container || webview.getAttribute('partition') !== webviewPartition)
  ) {
    destroyPersistentWebview(browserTabId)
    webview = undefined
    const refreshedContainer = resolveContainer()
    if (!refreshedContainer) {
      return null
    }
    activeContainer = refreshedContainer
  }
  if (webview) {
    setBrowserPageWebviewInputLocked(webview, inputLocked)
    return { container: activeContainer, created, webview }
  }

  webview = createBrowserWebviewElement()
  webview.setAttribute('partition', webviewPartition)
  webview.setAttribute('allowpopups', '')
  // Why: Electron spreads the webpreferences keys verbatim, so the shared
  // camelCase attribute must stay intact for fullscreen containment to work.
  webview.setAttribute('webpreferences', YIRU_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
  webview.style.display = 'flex'
  webview.style.flex = '1'
  webview.style.width = '100%'
  webview.style.height = '100%'
  webview.style.border = 'none'
  setBrowserPageWebviewInputLocked(webview, inputLocked)
  // Why: some pages never paint a background, and a white viewport matches
  // normal browser behavior instead of leaking Yiru chrome through the guest.
  webview.style.background = '#ffffff'
  registerPersistentWebview(browserTabId, webview)
  activeContainer.appendChild(webview)
  created = true

  return { container: activeContainer, created, webview }
}
