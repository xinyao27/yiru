import {
  buildSessionStoragePersistenceScript,
  YIRU_PERSIST_SESSION_STORAGE_EXPRESSION
} from '~shared/browser/session-storage-persistence'

import { unregisterBrowserGuest } from './browser-client'
import { clearLiveBrowserUrl } from './browser-live-url'
import { removeBrowserPageViewport } from './browser-page-viewport'
import type { BrowserWebviewElement } from './browser-webview-element'

// Why: Electron guests outlive individual React panes, so their registry belongs
// to the renderer runtime that coordinates view mounts and store cleanup.
export const webviewRegistry = new Map<string, BrowserWebviewElement>()
export const registeredWebContentsIds = new Map<string, number>()

export type BrowserWebviewMemoryProfile = {
  browserWebviewCount: number
  registeredBrowserGuestCount: number
}

const DRAG_LISTENER_KEY = '__yiruBrowserPaneDragListeners'
let dragListenersAttached = false
let nativeDragPassthroughRelease: (() => void) | null = null
const dragPassthroughTokens = new Set<symbol>()
const dragPassthroughPreviousPointerEvents = new Map<BrowserWebviewElement, string>()
const webviewDestruction = new Map<BrowserWebviewElement, Promise<void>>()
const SESSION_STORAGE_PERSIST_TIMEOUT_MS = 200

type DragListenerRegistry = {
  dragstart: () => void
  dragend: () => void
  drop: () => void
}

function getListenerHost(): (Window & { [DRAG_LISTENER_KEY]?: DragListenerRegistry }) | null {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return null
  }
  return window as Window & { [DRAG_LISTENER_KEY]?: DragListenerRegistry }
}

function removeDragListeners(): void {
  const listenerHost = getListenerHost()
  const existingListeners = listenerHost?.[DRAG_LISTENER_KEY]
  if (!listenerHost || !existingListeners) {
    return
  }
  window.removeEventListener('dragstart', existingListeners.dragstart, true)
  window.removeEventListener('dragend', existingListeners.dragend, true)
  window.removeEventListener('drop', existingListeners.drop, true)
  delete listenerHost[DRAG_LISTENER_KEY]
  dragListenersAttached = false
  nativeDragPassthroughRelease?.()
  nativeDragPassthroughRelease = null
}

function ensureDragListeners(): void {
  const listenerHost = getListenerHost()
  if (!listenerHost) {
    return
  }
  if (dragListenersAttached && listenerHost[DRAG_LISTENER_KEY]) {
    return
  }
  removeDragListeners()

  const dragstart = (): void => setWebviewsDragPassthrough(true)
  const dragend = (): void => setWebviewsDragPassthrough(false)
  const drop = (): void => setWebviewsDragPassthrough(false)

  window.addEventListener('dragstart', dragstart, true)
  window.addEventListener('dragend', dragend, true)
  window.addEventListener('drop', drop, true)
  // Why: only live webviews need drag passthrough listeners; removing them
  // when the registry empties keeps browserless sessions free of global hooks.
  listenerHost[DRAG_LISTENER_KEY] = { dragstart, dragend, drop }
  dragListenersAttached = true
}

export function getBrowserWebviewMemoryProfile(): BrowserWebviewMemoryProfile {
  return {
    browserWebviewCount: webviewRegistry.size,
    registeredBrowserGuestCount: registeredWebContentsIds.size
  }
}

function applyWebviewsDragPassthrough(): void {
  const passthrough = dragPassthroughTokens.size > 0
  for (const webview of webviewRegistry.values()) {
    if (passthrough) {
      if (!dragPassthroughPreviousPointerEvents.has(webview)) {
        dragPassthroughPreviousPointerEvents.set(webview, webview.style.pointerEvents)
      }
      webview.style.pointerEvents = 'none'
      continue
    }

    const previous = dragPassthroughPreviousPointerEvents.get(webview)
    if (previous !== undefined) {
      webview.style.pointerEvents = previous
      dragPassthroughPreviousPointerEvents.delete(webview)
    }
  }
}

export function acquireWebviewsDragPassthrough(): () => void {
  // Why: renderer-owned pointer drags (dnd-kit tab drags, terminal pane
  // reorders) do not emit HTML dragstart/dragend, but Electron webviews can
  // still steal the pointer stream unless they are temporarily transparent.
  const token = Symbol('webview-drag-passthrough')
  let released = false
  dragPassthroughTokens.add(token)
  applyWebviewsDragPassthrough()

  return () => {
    if (released) {
      return
    }
    released = true
    dragPassthroughTokens.delete(token)
    applyWebviewsDragPassthrough()
  }
}

export function setWebviewsDragPassthrough(passthrough: boolean): void {
  if (passthrough) {
    if (!nativeDragPassthroughRelease) {
      nativeDragPassthroughRelease = acquireWebviewsDragPassthrough()
    }
    return
  }

  nativeDragPassthroughRelease?.()
  nativeDragPassthroughRelease = null
}

function applyCurrentDragPassthroughToWebview(webview: BrowserWebviewElement): void {
  if (dragPassthroughTokens.size === 0) {
    return
  }
  if (!dragPassthroughPreviousPointerEvents.has(webview)) {
    dragPassthroughPreviousPointerEvents.set(webview, webview.style.pointerEvents)
  }
  webview.style.pointerEvents = 'none'
}

export function registerPersistentWebview(
  browserTabId: string,
  webview: BrowserWebviewElement
): void {
  webviewRegistry.set(browserTabId, webview)
  applyCurrentDragPassthroughToWebview(webview)
  ensureDragListeners()
}

export function unregisterPersistentWebview(browserTabId: string): void {
  const webview = webviewRegistry.get(browserTabId)
  if (webview) {
    dragPassthroughPreviousPointerEvents.delete(webview)
  }
  webviewRegistry.delete(browserTabId)
  if (webviewRegistry.size === 0) {
    removeDragListeners()
  }
}

function moveFocusToRendererIfWebviewOwnsFocus(webview: BrowserWebviewElement): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false
  }
  const activeElement = document.activeElement as HTMLElement | null
  if (!activeElement) {
    return false
  }
  // Why: hiding/removing a focused webview can let macOS reactivate the
  // previously-frontmost app. Give focus back to Yiru's renderer first.
  if (webview === activeElement || webview.contains(activeElement)) {
    activeElement.blur?.()
    window.focus()
    return true
  }
  return false
}

export function moveFocusToRendererBeforeFocusedWebviewHidden(): void {
  for (const webview of webviewRegistry.values()) {
    if (moveFocusToRendererIfWebviewOwnsFocus(webview)) {
      return
    }
  }
}

export function moveFocusToRendererBeforeWebviewDetach(webview: BrowserWebviewElement): void {
  moveFocusToRendererIfWebviewOwnsFocus(webview)
}

export async function waitForPendingWebviewDestruction(): Promise<void> {
  await Promise.allSettled(webviewDestruction.values())
}

async function persistSessionStorageBeforeDetach(
  browserTabId: string,
  webview: BrowserWebviewElement
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, SESSION_STORAGE_PERSIST_TIMEOUT_MS)
  })
  try {
    await Promise.race([
      webview
        .executeJavaScript(
          `${buildSessionStoragePersistenceScript(browserTabId, false)};${YIRU_PERSIST_SESSION_STORAGE_EXPRESSION}`
        )
        .then(() => {}),
      timeout
    ])
  } catch {
    // Why: the guest may already be gone during app teardown.
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

export function destroyPersistentWebview(browserTabId: string): void {
  const webview = webviewRegistry.get(browserTabId)
  if (!webview) {
    // Why: the viewport can outlive a missing webview entry; tear it down on
    // explicit close paths so overlay slots do not leak parked shells.
    removeBrowserPageViewport(browserTabId)
    registeredWebContentsIds.delete(browserTabId)
    clearLiveBrowserUrl(browserTabId)
    return
  }
  if (webviewDestruction.has(webview)) {
    return
  }
  moveFocusToRendererBeforeWebviewDetach(webview)
  let expectedWebContentsId: number | null = null
  try {
    expectedWebContentsId = webview.getWebContentsId()
  } catch {
    // Why: a guest closed before attachment never acquired a main registration.
  }
  webview.style.display = 'none'
  unregisterPersistentWebview(browserTabId)
  registeredWebContentsIds.delete(browserTabId)
  clearLiveBrowserUrl(browserTabId)
  // Why: removing a webview destroys sessionStorage immediately. Give the
  // pre-document bridge one bounded turn to capture this page's final state.
  const destruction = persistSessionStorageBeforeDetach(browserTabId, webview)
    .then(() => {
      if (expectedWebContentsId === null) {
        return
      }
      return unregisterBrowserGuest({
        browserPageId: browserTabId,
        expectedWebContentsId
      })
    })
    .catch(() => false)
    .then(() => {
      webview.remove()
      if (!webviewRegistry.has(browserTabId)) {
        removeBrowserPageViewport(browserTabId)
      }
    })
    .finally(() => {
      webviewDestruction.delete(webview)
    })
  webviewDestruction.set(webview, destruction)
}
