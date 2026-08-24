import { screen } from 'electron'
import {
  normalizeBrowserNavigationUrl,
  normalizeExternalBrowserUrl,
  redactKagiSessionToken
} from '~shared/browser/url'

import { publishShellEvent } from '../shell/events'
import { readGuestNavigationState } from './guest-navigation-state'

type ResolveRenderer = (browserTabId: string) => Electron.WebContents | null

export function setupGuestContextMenu(args: {
  browserTabId: string
  guest: Electron.WebContents
  resolveRenderer: ResolveRenderer
}): () => void {
  const { browserTabId, guest, resolveRenderer } = args
  const publishRequest = (_event: Electron.Event, params: Electron.ContextMenuParams): void => {
    const renderer = resolveRenderer(browserTabId)
    if (!renderer) {
      return
    }
    // Why: page URLs flow into renderer clipboard/external-open actions, so
    // bearer tokens must be removed before crossing the main boundary.
    const pageUrl = redactKagiSessionToken(guest.getURL())
    const rawLinkUrl = params.linkURL || ''
    const linkUrl = rawLinkUrl
      ? (normalizeExternalBrowserUrl(rawLinkUrl) ?? normalizeBrowserNavigationUrl(rawLinkUrl))
      : null
    const cursor = screen.getCursorScreenPoint()
    publishShellEvent(renderer.id, {
      type: 'browserContextMenuRequested',
      browserPageId: browserTabId,
      x: params.x,
      y: params.y,
      screenX: cursor.x,
      screenY: cursor.y,
      pageUrl,
      linkUrl,
      selectionText: params.selectionText ?? '',
      ...readGuestNavigationState(guest)
    })
  }

  // Why: before-mouse-event is high-frequency; install dismissal only while
  // the context menu is open.
  let dismissHandler: ((_event: Electron.Event, mouse: Electron.MouseInputEvent) => void) | null =
    null
  const removeDismissListener = (): void => {
    if (!dismissHandler) {
      return
    }
    try {
      guest.off('before-mouse-event', dismissHandler)
    } catch {
      // Guest may already be destroyed.
    }
    dismissHandler = null
  }
  const contextMenuHandler = (_event: Electron.Event, params: Electron.ContextMenuParams): void => {
    publishRequest(_event, params)
    removeDismissListener()
    dismissHandler = (_mouseEvent, mouse) => {
      if (mouse.type !== 'mouseDown' || mouse.button === 'right') {
        // Why: right mouseDown is followed by a new menu request; dismissing
        // between them flashes the menu at the renderer origin.
        return
      }
      const renderer = resolveRenderer(browserTabId)
      if (renderer) {
        publishShellEvent(renderer.id, {
          type: 'browserContextMenuDismissed',
          browserPageId: browserTabId
        })
      }
      removeDismissListener()
    }
    guest.on('before-mouse-event', dismissHandler)
  }

  guest.on('context-menu', contextMenuHandler)
  return () => {
    try {
      guest.off('context-menu', contextMenuHandler)
      removeDismissListener()
    } catch {
      // Guest teardown is best effort.
    }
  }
}
