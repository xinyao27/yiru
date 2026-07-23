import type { NativeChatMessage } from '@yiru/workbench-model/agent'
import { describe, expect, it } from 'vite-plus/test'

import { nativeChatStreamingMessage } from '../../../../shared/native-chat-streaming'
import {
  deriveNativeChatActivePrompt,
  pruneConfirmedNativeChatActivePrompt
} from './native-chat-active-prompt'
import { orderNativeChatMessages } from './native-chat-message-grouping'
import { pendingSendsAsMessages, type NativeChatPendingSend } from './native-chat-pending'

function pending(id: string, text: string, sentAt: number): NativeChatPendingSend {
  return { id, text, sentAt, afterMessageId: null, afterMessageTimestamp: null }
}

function transcript(id: string, role: 'user' | 'assistant', text: string): NativeChatMessage {
  return {
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: 30,
    source: 'transcript'
  }
}

describe('deriveNativeChatActivePrompt', () => {
  it('coalesces IME-fragmented optimistic sends into the prompt the agent received', () => {
    const entries = [pending('one', "帮我新开一个 ta'b", 10), pending('two', 'tab', 11)]
    const result = deriveNativeChatActivePrompt({
      pending: entries,
      pendingMessages: pendingSendsAsMessages(entries),
      existingMessages: [],
      prompt: "帮我新开一个 ta'btab",
      state: 'working',
      statusUpdatedAt: 12
    })

    expect(result.activePromptMessage?.role).toBe('user')
    expect(result.activePromptMessage?.blocks).toEqual([
      { type: 'text', text: "帮我新开一个 ta'btab" }
    ])
    expect(result.queuedPendingMessages).toEqual([])
  })

  it('leaves a later pending send queued behind the active response', () => {
    const entries = [pending('active', 'first', 10), pending('later', 'next', 20)]
    const result = deriveNativeChatActivePrompt({
      pending: entries,
      pendingMessages: pendingSendsAsMessages(entries),
      existingMessages: [],
      prompt: 'first',
      state: 'working',
      statusUpdatedAt: 15
    })

    expect(result.activePromptMessage?.blocks).toEqual([{ type: 'text', text: 'first' }])
    expect(result.queuedPendingMessages.map((message) => message.id)).toEqual(['pending:later'])
    expect(
      orderNativeChatMessages([
        result.activePromptMessage!,
        nativeChatStreamingMessage('reply'),
        ...result.queuedPendingMessages
      ]).map((message) => message.role)
    ).toEqual(['user', 'assistant', 'user'])
  })

  it('lets the authoritative combined transcript turn replace its fragments', () => {
    const entries = [pending('one', '你', 10), pending('two', '好', 11)]
    const existingMessages = [
      transcript('user', 'user', '你好'),
      transcript('assistant', 'assistant', '你好！')
    ]
    const result = deriveNativeChatActivePrompt({
      pending: entries,
      pendingMessages: pendingSendsAsMessages(entries),
      existingMessages,
      prompt: '你好',
      state: 'done',
      statusUpdatedAt: 40
    })

    expect(result.activePromptMessage).toBeNull()
    expect(result.queuedPendingMessages).toEqual([])
    expect(
      pruneConfirmedNativeChatActivePrompt({
        pending: entries,
        existingMessages,
        prompt: '你好',
        state: 'done',
        statusUpdatedAt: 40
      })
    ).toEqual([])
  })
})
