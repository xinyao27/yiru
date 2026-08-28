import type { BrowserTabProjectionEvent } from '~renderer/extension/browser-capabilities'
import { getExtensionBrowserCapabilities } from '~renderer/extension/browser-capabilities'
import { useAppStore } from '~renderer/store/state'

import { executeHostBrowserCommand } from './command'
import { findBrowserWorkspace } from './records'

let stopActiveBridge: (() => void) | null = null

export function startBrowserTabProjectionBridge(): void {
  stopActiveBridge?.()
  void executeHostBrowserCommand('browser.tabList', {}).catch(() => {})
  const unsubscribe = getExtensionBrowserCapabilities().subscribeBrowserTabProjections(
    reconcileBrowserTabProjectionEvent
  )
  const stop = (): void => {
    unsubscribe()
    window.removeEventListener('pagehide', stop)
    if (stopActiveBridge === stop) {
      stopActiveBridge = null
    }
  }
  stopActiveBridge = stop
  window.addEventListener('pagehide', stop)
}

function reconcileBrowserTabProjectionEvent(event: BrowserTabProjectionEvent): void {
  const state = useAppStore.getState()
  if (event.kind === 'removed') {
    state.removeHostBrowserTab(event.browserPageId)
    return
  }
  const existing = findBrowserWorkspace(state, event.browserPageId)
  const worktreeId = event.worktreeId ?? existing?.worktreeId ?? null
  if (!worktreeId) {
    return
  }
  const workspace = state.upsertHostBrowserTab({
    browserPageId: event.browserPageId,
    ...(existing ? { workspaceId: existing.workspace.id } : {}),
    worktreeId,
    url: event.url,
    title: event.title || event.url,
    activate: event.active
  })
  state.updateBrowserPageState(event.browserPageId, {
    faviconUrl: event.faviconUrl,
    loading: event.loading,
    title: event.title || event.url
  })
  if (event.active && state.activeWorktreeId === worktreeId) {
    state.focusBrowserTabInWorktree(worktreeId, event.browserPageId, { surfacePane: true })
    state.setActiveBrowserTab(workspace.id)
  }
}
