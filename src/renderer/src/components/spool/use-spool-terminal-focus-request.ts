import type { Terminal } from '@xterm/xterm'
import { useEffect, type RefObject } from 'react'

export function useSpoolTerminalFocusRequest(
  terminalRef: RefObject<Terminal | null>,
  focusRequested: boolean,
  onFocusHandled?: () => void
): void {
  useEffect(() => {
    if (!focusRequested) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current
      if (!terminal) {
        return
      }
      // Why: remote creation suppresses menu focus restoration, so the newly
      // mounted xterm must explicitly become the keyboard target.
      terminal.focus()
      onFocusHandled?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusRequested, onFocusHandled, terminalRef])
}
