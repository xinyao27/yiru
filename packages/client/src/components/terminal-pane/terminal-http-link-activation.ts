import { isTerminalLinkActivation } from './terminal-link-activation'
import { isMacPlatform } from './terminal-link-open-hints'

export function isTerminalHttpLinkActivation(
  event: Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey'> | undefined
): boolean {
  // Why: xterm deliberately forwards Alt-modified mouse gestures to the PTY,
  // so plain HTTP link handling must leave those gestures to the child TUI.
  const hasOtherPlatformModifier = isMacPlatform() ? event?.ctrlKey : event?.metaKey
  return Boolean(
    event && !event.altKey && !hasOtherPlatformModifier && isTerminalLinkActivation(event)
  )
}
