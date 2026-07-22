// Shared derivation for the in-flight "streaming" assistant bubble. While an
// agent works, its hook preview (lastAssistantMessage) is shown as a synthetic
// assistant message so the user sees the reply build in real time, before the
// completed turn is flushed to the transcript. Desktop and mobile both use this
// so the show/hide rule can't drift between platforms.

import type { AgentStatusState } from './agent-status-types'
import type { NativeChatMessage } from './native-chat-types'

/** The synthetic streaming bubble's stable id (kept stable so the list keys it
 *  consistently across ticks and the real turn can replace it cleanly). */
export const NATIVE_CHAT_STREAMING_ID = 'streaming'

/** Concatenated text of an assistant message's text blocks, trimmed. */
function assistantText(message: NativeChatMessage | undefined): string {
  if (!message || message.role !== 'assistant') {
    return ''
  }
  return message.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

/**
 * Decide the streaming text to show, or null to show nothing. Returns the
 * preview only while it leads the transcript — i.e. it's longer than (and not
 * already contained in) the last assistant turn. Once the real turn lands with
 * the same (or more) text, the preview is suppressed so the bubble doesn't
 * duplicate or flicker as the transcript catches up.
 *
 * A completed hook can also bridge a missed transcript append. The latest
 * transcript assistant turn suppresses that fallback even when a pending user
 * turn follows it.
 */
export function deriveNativeChatStreamingText(args: {
  messages: readonly NativeChatMessage[]
  previewText: string | null | undefined
  state: AgentStatusState | null
}): string | null {
  const { messages, previewText, state } = args
  const working = state === 'working'
  const completed = state === 'done'
  if (!working && !completed) {
    return null
  }
  const text = previewText?.trim()
  if (!text) {
    return null
  }
  const lastText = assistantText(
    completed && !working
      ? messages.findLast((candidate) => candidate.role === 'assistant')
      : messages.at(-1)
  )
  if (lastText.includes(text) || (working && text.length <= lastText.length)) {
    return null
  }
  return text
}

/** Build the synthetic streaming assistant message for the given text. */
export function nativeChatStreamingMessage(text: string): NativeChatMessage {
  return {
    id: NATIVE_CHAT_STREAMING_ID,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: null,
    source: 'hook'
  }
}
