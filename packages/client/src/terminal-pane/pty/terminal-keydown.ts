import type { Terminal } from '@xterm/xterm'

import { isCtrlCKeyEvent, isPlainEscapeKeyEvent } from '../agent/interrupt-inference'
import type { TerminalInputIntent } from './terminal-input-intent'

type TerminalKeydownOptions = {
  terminal: Terminal
  container: HTMLElement
  inputIntent: TerminalInputIntent
  sampleForegroundAgent: () => void
  clearTabUnread: () => void
  clearPaneUnread: () => void
  clearWorktreeUnread: () => void
}

export function installTerminalKeydown(options: TerminalKeydownOptions): () => void {
  const clearAttention = (): void => {
    options.clearTabUnread()
    options.clearPaneUnread()
    options.clearWorktreeUnread()
  }
  const onKeydown = (event: KeyboardEvent): void => {
    if (isPlainEscapeKeyEvent(event)) {
      options.inputIntent.setPending('plain-escape')
      // Why: Escape is real input and a user-presence signal even though its
      // interrupt inference exits before the general attention path.
      clearAttention()
      return
    }
    if (isCtrlCKeyEvent(event)) {
      if (!navigator.userAgent.includes('Mac') && options.terminal.hasSelection()) {
        return
      }
      options.inputIntent.setPending('ctrl-c')
    }
    // Why: modifier-only presses, repeats, and copy chords do not prove that
    // the user has interacted with this terminal session.
    if (
      event.repeat ||
      event.key === 'Alt' ||
      event.key === 'AltGraph' ||
      event.key === 'Control' ||
      event.key === 'Meta' ||
      event.key === 'Shift'
    ) {
      return
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'c' &&
      options.terminal.hasSelection()
    ) {
      return
    }
    // Why: shell frameworks can replace OSC 133;C. Enter at an idle prompt is
    // the only safe user-side opportunity to confirm a manually launched agent.
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      options.sampleForegroundAgent()
    }
    clearAttention()
  }

  const target = options.terminal.element ?? options.container
  if (
    typeof target?.addEventListener !== 'function' ||
    typeof target?.removeEventListener !== 'function'
  ) {
    return () => {}
  }
  target.addEventListener('keydown', onKeydown, { capture: true })
  return () => target.removeEventListener('keydown', onKeydown, { capture: true })
}
