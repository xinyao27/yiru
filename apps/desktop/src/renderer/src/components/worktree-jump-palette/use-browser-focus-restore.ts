import { useCallback, useEffect, useRef } from 'react'

import {
  YIRU_BROWSER_FOCUS_REQUEST_EVENT,
  queueBrowserFocusRequest
} from '@/components/browser-pane/browser-focus'
import { resolvePaletteFocusRestoreTarget } from '@/components/cmd-j/palette-focus-restore-target'

// Why: dismissing Cmd+J needs to hand focus back to whatever surface the user
// left — a browser page's webview/address-bar, or the previously-focused
// terminal/editor element — via a two-frame delay so Radix's own focus
// teardown finishes first. Isolating that timing dance keeps it out of the
// selection-handler logic that triggers it.
export function useBrowserFocusRestore() {
  const fallbackFocusOuterFrameRef = useRef<number | null>(null)
  const fallbackFocusInnerFrameRef = useRef<number | null>(null)

  const cancelFallbackFocusFrames = useCallback((): void => {
    if (fallbackFocusOuterFrameRef.current !== null) {
      cancelAnimationFrame(fallbackFocusOuterFrameRef.current)
      fallbackFocusOuterFrameRef.current = null
    }
    if (fallbackFocusInnerFrameRef.current !== null) {
      cancelAnimationFrame(fallbackFocusInnerFrameRef.current)
      fallbackFocusInnerFrameRef.current = null
    }
  }, [])

  useEffect(() => cancelFallbackFocusFrames, [cancelFallbackFocusFrames])

  const focusFallbackSurface = useCallback(
    (preferredTarget?: HTMLElement | null) => {
      cancelFallbackFocusFrames()
      fallbackFocusOuterFrameRef.current = requestAnimationFrame(() => {
        fallbackFocusOuterFrameRef.current = null
        fallbackFocusInnerFrameRef.current = requestAnimationFrame(() => {
          fallbackFocusInnerFrameRef.current = null
          resolvePaletteFocusRestoreTarget(preferredTarget ?? null)?.focus({ preventScroll: true })
        })
      })
    },
    [cancelFallbackFocusFrames]
  )

  const requestBrowserFocus = useCallback(
    (detail: { pageId: string; target: 'webview' | 'address-bar' }) => {
      queueBrowserFocusRequest(detail)
      window.dispatchEvent(
        new CustomEvent(YIRU_BROWSER_FOCUS_REQUEST_EVENT, {
          detail
        })
      )
    },
    []
  )

  return { focusFallbackSurface, requestBrowserFocus }
}
