import type { NativeChatMessage } from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'

import { deriveNativeChatStreamingText } from './native-chat-streaming'

function message(id: string, role: NativeChatMessage['role'], text: string): NativeChatMessage {
  return {
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: null,
    source: 'transcript'
  }
}

describe('deriveNativeChatStreamingText', () => {
  it('keeps a completed hook reply visible while the transcript catches up', () => {
    expect(
      deriveNativeChatStreamingText({
        messages: [message('user', 'user', 'hi')],
        previewText: 'Hi! What can I help you with?',
        state: 'done'
      })
    ).toBe('Hi! What can I help you with?')
  })

  it('does not duplicate a completed hook reply already present before a pending user turn', () => {
    expect(
      deriveNativeChatStreamingText({
        messages: [
          message('user-1', 'user', 'hi'),
          message('assistant', 'assistant', 'Hi! What can I help you with?'),
          message('user-2', 'user', 'What next?')
        ],
        previewText: 'Hi! What can I help you with?',
        state: 'done'
      })
    ).toBeNull()
  })

  it('still shows a shorter in-progress reply after a longer prior assistant turn', () => {
    expect(
      deriveNativeChatStreamingText({
        messages: [
          message('assistant', 'assistant', 'A much longer previous answer'),
          message('user', 'user', 'What is two plus two?')
        ],
        previewText: '4',
        state: 'working'
      })
    ).toBe('4')
  })

  it('shows a shorter completed reply when the transcript only has the prior turn', () => {
    expect(
      deriveNativeChatStreamingText({
        messages: [
          message('assistant', 'assistant', 'A much longer previous answer'),
          message('user', 'user', 'What is two plus two?')
        ],
        previewText: '4',
        state: 'done'
      })
    ).toBe('4')
  })
})
