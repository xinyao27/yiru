import { useEffect } from 'react'

import { shellClient } from '../runtime/shell-client'
import { refreshTerminalImeInputContext } from './ime/input-context-refresh'
import {
  isXtermHelperTextarea,
  releaseTerminalFocusForOutsidePointerDown,
  releaseTerminalFocusForWindowBlur,
  resyncTerminalFocusForWindowFocus,
  setRegularTerminalInputFocusAttribute
} from './regular-terminal-focus-ownership'

export function useRegularTerminalFocus(
  containerRef: React.RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    let ownsFocus = false
    let releasedHelperOnWindowBlur: HTMLElement | null = null
    let refreshingImeInputContext = false
    const syncFocused = (focused: boolean): void => {
      ownsFocus = focused
      if (focused) {
        releasedHelperOnWindowBlur = null
      }
      setRegularTerminalInputFocusAttribute(focused)
      shellClient.ui.setTerminalInputFocused?.(focused)
    }
    const onFocusIn = (event: FocusEvent): void => {
      if (!isXtermHelperTextarea(event.target)) {
        return
      }
      syncFocused(true)
      if (isXtermHelperTextarea(event.relatedTarget) && event.relatedTarget !== event.target) {
        refreshingImeInputContext = true
        try {
          refreshTerminalImeInputContext(event.target, {})
        } finally {
          refreshingImeInputContext = false
        }
      }
    }
    const onFocusOut = (event: FocusEvent): void => {
      if (
        isXtermHelperTextarea(event.target) &&
        !isXtermHelperTextarea(event.relatedTarget) &&
        !refreshingImeInputContext
      ) {
        syncFocused(false)
      }
    }
    const onPointerDown = (event: PointerEvent): void => {
      releaseTerminalFocusForOutsidePointerDown({
        container,
        activeElement: document.activeElement,
        pointerTarget: event.target,
        syncFocused
      })
    }
    const onWindowBlur = (): void => {
      releasedHelperOnWindowBlur = releaseTerminalFocusForWindowBlur({
        container,
        activeElement: document.activeElement,
        syncFocused
      })
    }
    const onWindowFocus = (): void => {
      if (
        resyncTerminalFocusForWindowFocus({
          container,
          activeElement: document.activeElement,
          syncFocused,
          releasedHelper: releasedHelperOnWindowBlur
        })
      ) {
        releasedHelperOnWindowBlur = null
      }
    }

    if (
      isXtermHelperTextarea(document.activeElement) &&
      container.contains(document.activeElement)
    ) {
      syncFocused(true)
    }
    container.addEventListener('focusin', onFocusIn)
    container.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('focus', onWindowFocus)
    return () => {
      container.removeEventListener('focusin', onFocusIn)
      container.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('focus', onWindowFocus)
      if (ownsFocus) {
        syncFocused(false)
      }
    }
  }, [containerRef])
}
