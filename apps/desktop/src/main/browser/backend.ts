// Why: desktop webviews/offscreen windows and pure Node Chrome targets have
// different process lifecycles. This port keeps runtime tab ownership on stable
// page ids while each composition point registers its backend-neutral handle.

import type { BrowserCookie } from './session'

export type BrowserBackendCreateTab = {
  browserPageId?: string
  url: string
  worktreeId?: string
  profileId?: string
  shellConnectionId?: string
}

export type BrowserNavigationState = {
  canGoBack: boolean
  canGoForward: boolean
}

export type BrowserBackend = {
  /** Create a browser page and register its handle. Returns the page id. */
  createTab(params: BrowserBackendCreateTab): Promise<{ browserPageId: string }>
  /** Tear down a browser page created by this backend. */
  closeTab(browserPageId: string): Promise<void>
  /** Prepare an isolated backend profile before its first page is created. */
  createProfile?(profileId: string): Promise<void>
  /** Remove an isolated backend profile and any targets that still belong to it. */
  deleteProfile?(profileId: string): Promise<void>
  /** Clear cookies from the default context or a named isolated profile. */
  clearProfileCookies?(profileId: string | null): Promise<void>
  /** Set one validated cookie in an isolated backend profile. */
  setProfileCookie?(profileId: string, cookie: BrowserCookie): Promise<void>
  /** Recreate a stable page id inside a different isolated profile. */
  setTabProfile?(browserPageId: string, profileId: string | null): Promise<void>
  /** Read the live browser history affordances for a page, when the backend exposes them. */
  getNavigationState?(browserPageId: string): BrowserNavigationState | null
  /** Tear down every page this backend owns (process shutdown). Optional —
   *  renderer-hosted backends are torn down with their window. */
  destroyAll?(): Promise<void> | void
}
