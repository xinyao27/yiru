import { useEffect } from 'react'
import {
  readPrimarySelectionText,
  setPrimarySelectionEnabled,
  setPrimarySelectionText,
  shouldSuppressPrimarySelectionNativePaste
} from '~renderer/lib/primary-selection'
import { readCurrentPrimarySelectionText } from '~renderer/lib/primary-selection-capture'

import {
  findEditablePrimarySelectionPasteTarget,
  pastePrimarySelectionTextIntoTarget,
  type EditablePrimarySelectionPasteTarget
} from './primary-selection-paste'

const PRIMARY_SELECTION_PENDING_TARGET_TTL_MS = 750

function captureCurrentSelection(): void {
  const text = readCurrentPrimarySelectionText()
  if (text) {
    setPrimarySelectionText(text)
  }
}

function suppressEvent(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

// Why: terminal-owned suppression is only for xterm's hidden input surface;
// unrelated keyboard and context-menu pastes elsewhere must remain native.
function isTerminalNativePasteTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.classList.contains('xterm-helper-textarea') || target.closest('.xterm') !== null)
  )
}

function isPrimarySelectionPasteTargetCurrent(
  target: EditablePrimarySelectionPasteTarget
): boolean {
  const activeElement = target.ownerDocument.activeElement
  return (
    target.isConnected &&
    activeElement instanceof Node &&
    (activeElement === target || target.contains(activeElement))
  )
}

export function usePrimarySelectionPaste(): void {
  useEffect(() => {
    setPrimarySelectionEnabled(true)
    let pendingMiddleTarget: EditablePrimarySelectionPasteTarget | null = null
    let pendingMiddleUntil = 0

    const targetMatchesPending = (target: EventTarget | null): boolean => {
      if (!pendingMiddleTarget || !(target instanceof Node)) {
        return false
      }
      return target === pendingMiddleTarget || pendingMiddleTarget.contains(target)
    }

    const rememberPendingTarget = (event: MouseEvent): boolean => {
      if (event.button !== 1) {
        return false
      }
      const target = findEditablePrimarySelectionPasteTarget(event.target)
      if (!target) {
        return false
      }
      pendingMiddleTarget = target
      // Why: native Linux middle-click paste emits follow-up input shortly
      // after mousedown; keep ownership only for the same gesture.
      pendingMiddleUntil = Date.now() + PRIMARY_SELECTION_PENDING_TARGET_TTL_MS
      return true
    }

    const suppressPendingPasteInput = (event: InputEvent | ClipboardEvent): void => {
      const isPasteInputEvent =
        typeof InputEvent !== 'function' ||
        !(event instanceof InputEvent) ||
        event.inputType === 'insertFromPaste'
      if (!isPasteInputEvent) {
        return
      }
      if (
        pendingMiddleTarget &&
        Date.now() <= pendingMiddleUntil &&
        targetMatchesPending(event.target)
      ) {
        suppressEvent(event)
        return
      }
      if (
        isTerminalNativePasteTarget(event.target) &&
        shouldSuppressPrimarySelectionNativePaste()
      ) {
        suppressEvent(event)
      }
    }

    let captureTimer: number | null = null

    const scheduleCapture = (): void => {
      if (captureTimer !== null) {
        window.clearTimeout(captureTimer)
      }
      captureTimer = window.setTimeout(() => {
        captureTimer = null
        captureCurrentSelection()
      }, 100)
    }

    const onMouseDown = (event: MouseEvent): void => {
      rememberPendingTarget(event)
    }

    const onMouseUp = (event: MouseEvent): void => {
      if (event.button !== 1 || !pendingMiddleTarget || Date.now() > pendingMiddleUntil) {
        pendingMiddleTarget = null
        return
      }

      const target = pendingMiddleTarget
      pendingMiddleTarget = null
      suppressEvent(event)
      const point = {
        clientX: event.clientX,
        clientY: event.clientY
      }
      void readPrimarySelectionText().then((text) => {
        // Why: async primary-selection reads can resolve after focus moved;
        // do not refocus and mutate a stale middle-click target.
        if (!text || !isPrimarySelectionPasteTargetCurrent(target)) {
          return
        }
        void pastePrimarySelectionTextIntoTarget(target, text, point).catch(() => {})
      })
    }

    const onAuxClick = (event: MouseEvent): void => {
      if (event.button !== 1) {
        return
      }
      const target = findEditablePrimarySelectionPasteTarget(event.target)
      if (!target) {
        return
      }
      suppressEvent(event)
    }

    document.addEventListener('selectionchange', scheduleCapture)
    document.addEventListener('mouseup', scheduleCapture, true)
    document.addEventListener('keyup', scheduleCapture, true)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('beforeinput', suppressPendingPasteInput, true)
    document.addEventListener('paste', suppressPendingPasteInput, true)
    document.addEventListener('mouseup', onMouseUp, true)
    document.addEventListener('auxclick', onAuxClick, true)

    return () => {
      setPrimarySelectionEnabled(false)
      if (captureTimer !== null) {
        window.clearTimeout(captureTimer)
      }
      document.removeEventListener('selectionchange', scheduleCapture)
      document.removeEventListener('mouseup', scheduleCapture, true)
      document.removeEventListener('keyup', scheduleCapture, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('beforeinput', suppressPendingPasteInput, true)
      document.removeEventListener('paste', suppressPendingPasteInput, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      document.removeEventListener('auxclick', onAuxClick, true)
    }
  }, [])
}
