import {
  destroyPersistentWebview,
  moveFocusToRendererBeforeFocusedWebviewHidden
} from '~renderer/runtime/browser-webview-registry'
import type { BrowserPage } from '~shared/types'

export { moveFocusToRendererBeforeFocusedWebviewHidden }

export function destroyRemovedBrowserWebview(browserPageId: string): void {
  destroyPersistentWebview(browserPageId)
}

export function destroyWorkspaceWebviews(
  browserPagesByWorkspace: Record<string, BrowserPage[]>,
  workspaceId: string
): void {
  const pages = browserPagesByWorkspace[workspaceId] ?? []
  if (pages.length === 0) {
    // Why: legacy sessions persisted before pages existed still key their
    // webview by workspace id. Preserve the legacy destroy as a fallback.
    destroyRemovedBrowserWebview(workspaceId)
    return
  }
  for (const page of pages) {
    destroyRemovedBrowserWebview(page.id)
  }
}
