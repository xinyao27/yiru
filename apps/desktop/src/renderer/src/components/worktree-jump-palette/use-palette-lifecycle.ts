import { useCallback, useEffect, useMemo, useRef } from 'react'

import {
  captureCmdJActiveGroupSnapshot,
  type CmdJActiveGroupSnapshot
} from '@/components/cmd-j/quick-action-context'
import { createWorktreePaletteRequestGuard } from '@/components/worktree-jump-palette/worktree-palette-create-action'
import { useAppStore } from '@/store'

import type { PaletteStoreState } from './use-palette-store-state'

type PaletteLifecycleInput = Pick<
  PaletteStoreState,
  | 'visible'
  | 'activeWorktreeId'
  | 'activeTabType'
  | 'activeBrowserTabId'
  | 'browserTabsByWorktree'
  | 'recordFeatureInteraction'
  | 'closeModal'
> & {
  setQuery: (query: string) => void
  setSelectedItemId: (id: string) => void
  focusFallbackSurface: (preferredTarget?: HTMLElement | null) => void
  requestBrowserFocus: (detail: { pageId: string; target: 'webview' | 'address-bar' }) => void
}

// Why: everything about "what was focused/active right before Cmd+J opened,
// and how to get back to it on close" lives together — the open/close
// transition effect, the request-guard for pending create lookups, and the
// dialog's onOpenChange handler all read and write the same snapshot refs.
export function usePaletteLifecycle(input: PaletteLifecycleInput) {
  const {
    visible,
    activeWorktreeId,
    activeTabType,
    activeBrowserTabId,
    browserTabsByWorktree,
    recordFeatureInteraction,
    closeModal,
    setQuery,
    setSelectedItemId,
    focusFallbackSurface,
    requestBrowserFocus
  } = input

  const previousWorktreeIdRef = useRef<string | null>(null)
  const previousActiveTabTypeRef = useRef<'browser' | 'editor' | 'terminal' | 'simulator'>(
    'terminal'
  )
  const previousBrowserPageIdRef = useRef<string | null>(null)
  const previousBrowserFocusTargetRef = useRef<'webview' | 'address-bar'>('webview')
  // Why: the exact element focused before Cmd+J opened (e.g. the terminal
  // textarea the user was typing in) so Escape restores it precisely instead
  // of the first matching surface in the DOM, which may be a background
  // worktree's mounted-but-hidden terminal.
  const previousFocusElementRef = useRef<HTMLElement | null>(null)
  const activeGroupSnapshotRef = useRef<CmdJActiveGroupSnapshot | null>(null)
  const wasVisibleRef = useRef(false)
  const skipRestoreFocusRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const createLookupGuard = useMemo(() => createWorktreePaletteRequestGuard(), [])
  const preserveCreateLookupOnCloseRef = useRef(false)

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      recordFeatureInteraction('cmd-j')
      createLookupGuard.invalidate()
      activeGroupSnapshotRef.current = captureCmdJActiveGroupSnapshot(
        useAppStore.getState(),
        activeWorktreeId
      )
      previousWorktreeIdRef.current = activeWorktreeId
      previousActiveTabTypeRef.current = activeTabType
      previousBrowserPageIdRef.current =
        activeWorktreeId && activeTabType === 'browser'
          ? ((browserTabsByWorktree[activeWorktreeId] ?? []).find(
              (workspace) => workspace.id === activeBrowserTabId
            )?.activePageId ?? null)
          : null
      // Why: capture which browser surface had focus *before* Radix Dialog
      // steals it. By onOpenAutoFocus time, document.activeElement has already
      // moved to the dialog content, so address-bar detection must happen here.
      previousBrowserFocusTargetRef.current =
        activeTabType === 'browser' &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.closest('[data-yiru-browser-address-bar="true"]')
          ? 'address-bar'
          : 'webview'
      // Why: same timing constraint — capture the pre-dialog focus target now
      // so Escape can return focus to the exact input the user left (excluding
      // document.body, which isn't a meaningful restore target).
      previousFocusElementRef.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null
      skipRestoreFocusRef.current = false
      setQuery('')
      setSelectedItemId('')
      listRef.current?.scrollTo(0, 0)
    }

    if (!visible && wasVisibleRef.current) {
      if (preserveCreateLookupOnCloseRef.current) {
        // Why: create intentionally closes the palette before GH resolves;
        // reopening still invalidates the pending lookup above.
        preserveCreateLookupOnCloseRef.current = false
      } else {
        createLookupGuard.invalidate()
      }
      activeGroupSnapshotRef.current = null
    }

    wasVisibleRef.current = visible
  }, [
    activeBrowserTabId,
    activeTabType,
    activeWorktreeId,
    browserTabsByWorktree,
    createLookupGuard,
    recordFeatureInteraction,
    visible,
    setQuery,
    setSelectedItemId
  ])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        return
      }

      closeModal()
      if (skipRestoreFocusRef.current) {
        return
      }
      if (previousActiveTabTypeRef.current === 'browser' && previousBrowserPageIdRef.current) {
        // Why: dismissing Cmd+J from a browser surface should return focus to
        // that page, not fall through to the generic terminal/editor fallback.
        requestBrowserFocus({
          pageId: previousBrowserPageIdRef.current,
          target: previousBrowserFocusTargetRef.current
        })
        return
      }
      if (previousWorktreeIdRef.current) {
        // Why: dismissing Cmd+J should return to whatever the user was doing —
        // restore the exact previously-focused surface (e.g. the terminal they
        // were typing in) rather than an arbitrary first match.
        focusFallbackSurface(previousFocusElementRef.current)
      }
    },
    [closeModal, focusFallbackSurface, requestBrowserFocus]
  )

  return {
    listRef,
    activeGroupSnapshotRef,
    skipRestoreFocusRef,
    createLookupGuard,
    preserveCreateLookupOnCloseRef,
    previousWorktreeIdRef,
    previousActiveTabTypeRef,
    previousBrowserPageIdRef,
    previousBrowserFocusTargetRef,
    handleOpenChange
  }
}
