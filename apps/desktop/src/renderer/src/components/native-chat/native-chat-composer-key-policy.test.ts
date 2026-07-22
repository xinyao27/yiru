import { describe, expect, it } from 'vite-plus/test'

import { shouldSubmitNativeChatComposer } from './native-chat-composer-key-policy'

describe('shouldSubmitNativeChatComposer', () => {
  it('submits a regular unmodified Enter', () => {
    expect(shouldSubmitNativeChatComposer({ key: 'Enter', shiftKey: false, nativeEvent: {} })).toBe(
      true
    )
  })

  it('does not submit Enter while an IME composition is active', () => {
    expect(
      shouldSubmitNativeChatComposer({
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { isComposing: true }
      })
    ).toBe(false)
  })

  it('honors the keyCode 229 composition fallback used by some IMEs', () => {
    expect(
      shouldSubmitNativeChatComposer({
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { keyCode: 229 }
      })
    ).toBe(false)
  })
})
