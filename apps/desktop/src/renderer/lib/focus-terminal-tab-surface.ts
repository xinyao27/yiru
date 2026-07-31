/**
 * Move keyboard focus into the xterm instance for a freshly-mounted terminal
 * tab. Handles the two-step race where React must first mount the new
 * TerminalPane/xterm before the hidden .xterm-helper-textarea exists —
 * double-rAF waits for that commit so focus lands on the new tab instead of
 * whatever surface (menu trigger, body, previous tab) just relinquished it.
 */
function cssAttributeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

let pendingFocusFrameIds: number[] = []
// Why: daemon-backed chat can mount after the tab itself; keep the shortcut's
// focus intent alive for roughly two seconds without a polling timer.
const NATIVE_CHAT_FOCUS_FRAME_LIMIT = 120

function cancelPendingFocusFrames(): void {
  if (typeof cancelAnimationFrame === 'function') {
    for (const frameId of pendingFocusFrameIds) {
      cancelAnimationFrame(frameId)
    }
  }
  pendingFocusFrameIds = []
}

function canUseSinglePaneStaleLeafFallback(tabId: string, leafId: string): boolean {
  const tabElement = document.querySelector(`[data-terminal-tab-id="${cssAttributeString(tabId)}"]`)
  const expectedLeafIds = tabElement
    ?.getAttribute('data-terminal-layout-leaf-ids')
    ?.split(' ')
    .filter(Boolean)
  return expectedLeafIds?.length === 1 && !expectedLeafIds.includes(leafId)
}

export function focusTerminalTabSurface(tabId: string, leafId?: string | null): void {
  cancelPendingFocusFrames()
  const firstFrameId = requestAnimationFrame(() => {
    pendingFocusFrameIds = pendingFocusFrameIds.filter((frameId) => frameId !== firstFrameId)
    const secondFrameId = requestAnimationFrame(() => {
      pendingFocusFrameIds = pendingFocusFrameIds.filter((frameId) => frameId !== secondFrameId)
      // Why: this can be queued before inline tab rename mounts. If it runs
      // afterward, focusing xterm blurs the rename input and commits it closed.
      if (document.querySelector('[data-tab-rename-input="true"]')) {
        return
      }
      const escapedTabId = cssAttributeString(tabId)
      const nativeChatRoot = document.querySelector(
        `[data-terminal-tab-id="${escapedTabId}"] [data-native-chat-root="true"]`
      ) as HTMLElement | null
      if (nativeChatRoot) {
        // Why: chat tabs keep xterm mounted underneath; focusing its hidden
        // textarea would steal typing from the visible composer surface.
        nativeChatRoot.focus({ preventScroll: true })
        return
      }
      const scopedSelector = leafId
        ? `[data-terminal-tab-id="${escapedTabId}"] [data-leaf-id="${cssAttributeString(leafId)}"] .xterm-helper-textarea`
        : `[data-terminal-tab-id="${escapedTabId}"] .xterm-helper-textarea`
      const scoped = document.querySelector(scopedSelector) as HTMLElement | null
      if (scoped) {
        scoped.focus()
        return
      }
      if (leafId) {
        if (!canUseSinglePaneStaleLeafFallback(tabId, leafId)) {
          // Why: exact mobile split-pane focus must not silently focus a sibling
          // pane when the requested UUID leaf has not mounted yet.
          return
        }
        // Why: old single-pane remounts could remint the leaf id. Only recover
        // after the tab layout no longer expects the requested leaf.
        const tabScopedHelpers = document.querySelectorAll(
          `[data-terminal-tab-id="${escapedTabId}"] .xterm-helper-textarea`
        )
        if (tabScopedHelpers.length === 1) {
          const fallback = tabScopedHelpers.item(0) as HTMLElement | null
          fallback?.focus()
          return
        }
        return
      }
      const fallback = document.querySelector('.xterm-helper-textarea') as HTMLElement | null
      fallback?.focus()
    })
    pendingFocusFrameIds.push(secondFrameId)
  })
  pendingFocusFrameIds.push(firstFrameId)
}

export function focusNativeChatTabSurface(tabId: string): void {
  cancelPendingFocusFrames()
  const escapedTabId = cssAttributeString(tabId)
  let framesRemaining = NATIVE_CHAT_FOCUS_FRAME_LIMIT

  const focusWhenMounted = (): void => {
    const root = document.querySelector(
      `[data-terminal-tab-id="${escapedTabId}"] [data-native-chat-root="true"]`
    ) as HTMLElement | null
    if (root && root.getClientRects().length > 0) {
      root.focus({ preventScroll: true })
      return
    }
    framesRemaining -= 1
    if (framesRemaining <= 0) {
      return
    }
    const frameId = requestAnimationFrame(() => {
      pendingFocusFrameIds = pendingFocusFrameIds.filter((pending) => pending !== frameId)
      focusWhenMounted()
    })
    pendingFocusFrameIds.push(frameId)
  }

  focusWhenMounted()
}
