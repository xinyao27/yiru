import { describe, expect, it } from 'vite-plus/test'

import {
  firesNativePasteEvent,
  getClipboardEventText,
  shouldUseClipboardEventPaste
} from './terminal-clipboard-event-paste'

function keyEvent(
  overrides: Partial<Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>>
): Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'> {
  return { key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...overrides }
}

function clipboardEvent(text: string | null): ClipboardEvent {
  return {
    clipboardData:
      text === null ? null : { getData: (type: string) => (type === 'text/plain' ? text : '') }
  } as ClipboardEvent
}

describe('shouldUseClipboardEventPaste', () => {
  it('uses event text only for web clients without async clipboard reads', () => {
    expect(
      shouldUseClipboardEventPaste({ isWebClient: true, clipboardReadTextAvailable: false })
    ).toBe(true)
    expect(
      shouldUseClipboardEventPaste({ isWebClient: true, clipboardReadTextAvailable: true })
    ).toBe(false)
    expect(
      shouldUseClipboardEventPaste({ isWebClient: false, clipboardReadTextAvailable: false })
    ).toBe(false)
  })
})

describe('getClipboardEventText', () => {
  it('reads text/plain and tolerates missing clipboard data', () => {
    expect(getClipboardEventText(clipboardEvent('echo hi'))).toBe('echo hi')
    expect(getClipboardEventText(clipboardEvent(null))).toBe('')
  })
})

describe('firesNativePasteEvent', () => {
  it('recognizes platform-native paste chords', () => {
    expect(firesNativePasteEvent(keyEvent({ key: 'v', metaKey: true }), true)).toBe(true)
    expect(firesNativePasteEvent(keyEvent({ key: 'v', ctrlKey: true }), false)).toBe(true)
    expect(
      firesNativePasteEvent(keyEvent({ key: 'v', ctrlKey: true, shiftKey: true }), false)
    ).toBe(true)
    expect(firesNativePasteEvent(keyEvent({ key: 'Insert', shiftKey: true }), false)).toBe(true)
  })

  it('keeps remapped and cross-platform chords on the explicit paste path', () => {
    expect(firesNativePasteEvent(keyEvent({ key: 'y', ctrlKey: true }), false)).toBe(false)
    expect(firesNativePasteEvent(keyEvent({ key: 'v', metaKey: true }), false)).toBe(false)
    expect(firesNativePasteEvent(keyEvent({ key: 'v', ctrlKey: true }), true)).toBe(false)
  })
})
