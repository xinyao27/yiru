import { useEffect } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import {
  ModifierDoubleTapDetector,
  toModifierDoubleTapEvent
} from '../modifier-double-tap-detector'
import {
  dispatchGlobalShortcut,
  type GlobalShortcutState,
  type ShortcutDispatchInput
} from './global-shortcut-dispatch'

export function useGlobalShortcuts(state: GlobalShortcutState): void {
  const dispatch = useEventCallback((input: ShortcutDispatchInput): void => {
    dispatchGlobalShortcut(input, state)
  })

  useEffect(() => {
    const doubleTapDetector = new ModifierDoubleTapDetector()
    const handleKeyDown = (event: KeyboardEvent): void => {
      const detected = doubleTapDetector.process(
        toModifierDoubleTapEvent({
          type: 'keyDown',
          code: event.code,
          key: event.key,
          shift: event.shiftKey,
          control: event.ctrlKey,
          alt: event.altKey,
          meta: event.metaKey,
          isAutoRepeat: event.repeat
        }),
        Date.now()
      )
      if (event.repeat) {
        return
      }
      if (detected) {
        dispatch({
          doubleTapModifier: detected.modifier,
          target: event.target,
          defaultPrevented: event.defaultPrevented,
          preventDefault: () => event.preventDefault()
        })
        return
      }
      dispatch({
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        target: event.target,
        defaultPrevented: event.defaultPrevented,
        preventDefault: () => event.preventDefault()
      })
    }
    const handleKeyUp = (event: KeyboardEvent): void => {
      doubleTapDetector.process(
        toModifierDoubleTapEvent({
          type: 'keyUp',
          code: event.code,
          key: event.key,
          shift: event.shiftKey,
          control: event.ctrlKey,
          alt: event.altKey,
          meta: event.metaKey
        }),
        Date.now()
      )
    }
    const handleBlur = (): void => doubleTapDetector.reset()

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', handleBlur)
    }
  }, [dispatch])
}
