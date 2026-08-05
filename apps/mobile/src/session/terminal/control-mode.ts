import { useCallback, useRef, useState, type RefObject } from 'react'

import { buildTerminalShortcutKey } from '~/terminal/accessory-keys'

type MobileTerminalControlModeOptions = {
  activeHandleRef: RefObject<string | null>
  onSendControlByte: (bytes: string) => void
}

type TerminalInputChange = (text: string) => void

function getTerminalControlByte(value: string): string | null {
  const key = Array.from(value)[0]
  return key ? (buildTerminalShortcutKey({ key, modifiers: ['ctrl'] })?.bytes ?? null) : null
}

export function useMobileTerminalControlMode({
  activeHandleRef,
  onSendControlByte
}: MobileTerminalControlModeOptions): {
  controlModeActive: boolean
  handleInputChange: (text: string, onInputChange: TerminalInputChange) => void
  liveInputCapture: string
  reset: () => void
  setLiveInputCapture: (text: string) => void
  toggle: () => void
} {
  const [liveInputCapture, setLiveInputCaptureState] = useState('')
  const liveInputCaptureRef = useRef('')
  const [isActive, setIsActive] = useState(false)
  const controlModeRef = useRef(false)
  const controlModeHandleRef = useRef<string | null>(null)

  const setLiveInputCapture = useCallback((text: string) => {
    liveInputCaptureRef.current = text
    setLiveInputCaptureState(text)
  }, [])

  const reset = useCallback(() => {
    controlModeRef.current = false
    controlModeHandleRef.current = null
    setIsActive(false)
  }, [])

  const toggle = useCallback(() => {
    if (!activeHandleRef.current) {
      return
    }
    const nextActive =
      !controlModeRef.current || controlModeHandleRef.current !== activeHandleRef.current
    controlModeRef.current = nextActive
    controlModeHandleRef.current = nextActive ? activeHandleRef.current : null
    setIsActive(nextActive)
  }, [activeHandleRef])

  const handleInputChange = useCallback(
    (text: string, onInputChange: TerminalInputChange) => {
      const previousText = liveInputCaptureRef.current
      if (!controlModeRef.current || controlModeHandleRef.current !== activeHandleRef.current) {
        reset()
        onInputChange(text)
        return
      }

      const appendedText = text.startsWith(previousText) ? text.slice(previousText.length) : text
      const appendedKeys = Array.from(appendedText)
      const controlByte =
        appendedKeys.length === 1 ? getTerminalControlByte(appendedKeys[0] ?? '') : null
      if (controlByte === null) {
        reset()
        onInputChange(text)
        return
      }

      reset()
      setLiveInputCapture(previousText)
      onSendControlByte(controlByte)
    },
    [activeHandleRef, onSendControlByte, reset, setLiveInputCapture]
  )

  return {
    controlModeActive: isActive && controlModeHandleRef.current === activeHandleRef.current,
    handleInputChange,
    liveInputCapture,
    reset,
    setLiveInputCapture,
    toggle
  }
}
