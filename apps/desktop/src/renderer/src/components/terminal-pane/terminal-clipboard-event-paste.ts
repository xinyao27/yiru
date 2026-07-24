import { isWebClientLocation } from '@/lib/web-client-location'

// Why: navigator.clipboard is unavailable on plain-HTTP web clients, where the
// browser's native ClipboardEvent is the only path to clipboard text.
export function shouldUseClipboardEventPaste(args: {
  isWebClient: boolean
  clipboardReadTextAvailable: boolean
}): boolean {
  return args.isWebClient && !args.clipboardReadTextAvailable
}

export function isClipboardEventPasteRequired(): boolean {
  return shouldUseClipboardEventPaste({
    isWebClient: isWebClientLocation(),
    clipboardReadTextAvailable: typeof navigator.clipboard?.readText === 'function'
  })
}

export function getClipboardEventText(event: ClipboardEvent): string {
  return event.clipboardData?.getData('text/plain') ?? ''
}

type PasteChordEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>

// Why: remapped paste shortcuts do not generate a native paste event and must
// stay on the explicit clipboard path instead of leaking raw input to the PTY.
export function firesNativePasteEvent(event: PasteChordEvent, isMac: boolean): boolean {
  const key = event.key.toLowerCase()
  if (isMac) {
    return key === 'v' && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  }
  if (key === 'v' && event.ctrlKey && !event.metaKey && !event.altKey) {
    return true
  }
  return (
    event.key === 'Insert' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
  )
}
