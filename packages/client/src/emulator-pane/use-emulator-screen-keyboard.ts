import type { ClipboardEvent, KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  buildServeSimKeyboardFramesForKey,
  type ServeSimKeyboardFrame
} from '~renderer/emulator-keyboard-frame'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'

import {
  pasteTextIntoEmulatorKeyboard,
  type EmulatorKeyboardPasteResult
} from './emulator-keyboard-paste'

type UseEmulatorScreenKeyboardArgs = {
  cancelKeyboardFrames: () => void
  canInteract: boolean
  sendKeyboardFrames: (frames: ServeSimKeyboardFrame[]) => boolean
}

export function useEmulatorScreenKeyboard({
  cancelKeyboardFrames,
  canInteract,
  sendKeyboardFrames
}: UseEmulatorScreenKeyboardArgs) {
  const captureActiveRef = useRef(false)
  const canInteractRef = useRef(canInteract)
  const pasteRequestIdRef = useRef(0)
  const [captureState, setCaptureState] = useState({ canInteract, active: false })
  const keyboardCaptureActive = captureState.canInteract === canInteract && captureState.active

  const cancelActivePaste = useEventCallback((): void => {
    pasteRequestIdRef.current += 1
    cancelKeyboardFrames()
  })

  const setCaptureActive = useEventCallback((active: boolean): void => {
    if (!active) {
      cancelActivePaste()
    }
    captureActiveRef.current = active
    setCaptureState({ canInteract, active })
  })

  useEffect(() => {
    canInteractRef.current = canInteract
    if (!canInteract) {
      cancelActivePaste()
      captureActiveRef.current = false
    }
  }, [canInteract, cancelActivePaste])

  const enableKeyboardCapture = () => {
    if (canInteract) {
      setCaptureActive(true)
    }
  }

  const handleBlur = () => {
    setCaptureActive(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !canInteract ||
      event.nativeEvent.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return
    }

    if (event.key === 'Escape') {
      if (captureActiveRef.current) {
        setCaptureActive(false)
        event.currentTarget.blur()
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }

    if (!captureActiveRef.current) {
      if (event.key === 'Enter' || event.key === ' ') {
        setCaptureActive(true)
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }

    const frames = buildServeSimKeyboardFramesForKey(event.key, { shift: event.shiftKey })
    if (!frames || !sendKeyboardFrames(frames)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!canInteract || !captureActiveRef.current) {
      return
    }
    const text = event.clipboardData.getData('text')
    if (!text) {
      return
    }
    event.preventDefault()
    event.stopPropagation()

    cancelActivePaste()
    const pasteRequestId = pasteRequestIdRef.current
    void pasteTextIntoEmulatorKeyboard({
      isCancelled: () =>
        pasteRequestIdRef.current !== pasteRequestId ||
        !captureActiveRef.current ||
        !canInteractRef.current,
      sendKeyboardFrames,
      text
    }).then((result) => {
      if (pasteRequestIdRef.current !== pasteRequestId && result.status !== 'cancelled') {
        return
      }
      showEmulatorKeyboardPasteResult(result)
    })
  }

  return {
    enableKeyboardCapture,
    handleBlur,
    handleKeyDown,
    handlePaste,
    keyboardCaptureActive
  }
}

function showEmulatorKeyboardPasteResult(result: EmulatorKeyboardPasteResult): void {
  if (result.status !== 'rejected' || result.reason === 'empty') {
    return
  }

  if (result.reason === 'too-large') {
    toast.error(
      translate(
        'auto.components.emulator.pane.useEmulatorScreenKeyboard.pasteTooLarge',
        'Paste is too large for emulator keyboard input.'
      )
    )
    return
  }

  if (result.reason === 'unsupported-text') {
    toast.error(
      translate(
        'auto.components.emulator.pane.useEmulatorScreenKeyboard.unsupportedPasteText',
        'Emulator keyboard paste supports US keyboard text only.'
      )
    )
    return
  }

  toast.error(
    translate(
      'auto.components.emulator.pane.useEmulatorScreenKeyboard.pasteTargetUnavailable',
      'Emulator keyboard paste failed because the device is not ready.'
    )
  )
}
