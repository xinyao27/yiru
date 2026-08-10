import {
  MOBILE_NATIVE_CHAT_DEFAULT_WINDOW,
  MOBILE_NATIVE_CHAT_MAX_WINDOW,
  type NativeChatSessionInput,
  type NativeChatUnsubscribeInput,
  type RuntimeNativeChatSubscriptionEvent
} from '@yiru/runtime-protocol/contract'
import type { NativeChatBlock, NativeChatMessage } from '@yiru/workbench-model/agent'
import {
  readNativeChatTranscriptTail,
  subscribeNativeChatTranscript
} from '~main/native-chat/transcript-watch'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

// Why: native chat renders an agent's own transcript (Claude/Codex JSONL). The
// desktop reaches the readers via Electron IPC; mobile/web clients reach the
// same pure readers through these runtime RPC methods so the native chat view
// works over the paired connection, not just in the desktop renderer.

// Why: a long agent session can hold thousands of turns (with full tool I/O).
// Shipping all of them over the paired connection and rendering them at once
// freezes the mobile app, so the runtime RPC windows to the most recent slice —
// the conversation tail is what the chat view shows first. The desktop IPC path
// is unaffected (it reads locally with a virtualized list).
// Small first page for a fast initial paint; the client raises `limit` to load
// older history as the user scrolls back.
// Why: a single tool result (a big file read, a long diff) can be hundreds of KB.
// The mobile view only previews block bodies, so truncate them on the wire to
// keep the payload small; the marker tells the user content was clipped.
const MOBILE_BLOCK_CHAR_CAP = 4000
const MOBILE_TOOL_INPUT_ITEMS_CAP = 20
const MOBILE_TOOL_INPUT_NODE_CAP = 100
const TRUNCATION_MARKER = '\n… (truncated)'

function clip(text: string): string {
  return text.length > MOBILE_BLOCK_CHAR_CAP
    ? text.slice(0, MOBILE_BLOCK_CHAR_CAP) + TRUNCATION_MARKER
    : text
}

function clipBlock(block: NativeChatBlock): NativeChatBlock {
  if (block.type === 'text') {
    return block.text.length > MOBILE_BLOCK_CHAR_CAP ? { ...block, text: clip(block.text) } : block
  }
  if (block.type === 'tool-result') {
    return block.output.length > MOBILE_BLOCK_CHAR_CAP
      ? { ...block, output: clip(block.output) }
      : block
  }
  if (block.type === 'tool-call') {
    const budget = { remaining: MOBILE_BLOCK_CHAR_CAP, nodes: MOBILE_TOOL_INPUT_NODE_CAP }
    return { ...block, input: sanitizeToolInput(block.input, budget, 0) }
  }
  return block
}

function sanitizeToolInput(
  value: unknown,
  budget: { remaining: number; nodes: number },
  depth: number
): unknown {
  budget.nodes--
  if (budget.nodes < 0 || budget.remaining <= 0) {
    return '… (truncated)'
  }
  if (typeof value === 'string') {
    const length = Math.min(value.length, budget.remaining)
    budget.remaining -= length
    return length < value.length ? `${value.slice(0, length)}… (truncated)` : value
  }
  if (!value || typeof value !== 'object' || depth >= 5) {
    return value && typeof value === 'object' ? '… (truncated)' : value
  }
  if (Array.isArray(value)) {
    const result = value
      .slice(0, MOBILE_TOOL_INPUT_ITEMS_CAP)
      .map((item) => sanitizeToolInput(item, budget, depth + 1))
    if (value.length > MOBILE_TOOL_INPUT_ITEMS_CAP) {
      result.push('… (truncated)')
    }
    return result
  }
  const result: Record<string, unknown> = {}
  let count = 0
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue
    }
    if (count >= MOBILE_TOOL_INPUT_ITEMS_CAP || budget.remaining <= 0) {
      result['…'] = 'truncated'
      break
    }
    let boundedKey = key.slice(0, Math.min(key.length, budget.remaining, 128))
    // Why: sibling keys sharing a >=128-char (or budget-truncated) prefix collapse
    // to the same bounded key; suffix collisions so neither field is silently lost.
    if (Object.prototype.hasOwnProperty.call(result, boundedKey)) {
      boundedKey = `${boundedKey}~${count}`
    }
    budget.remaining -= boundedKey.length
    result[boundedKey] = sanitizeToolInput(
      (value as Record<string, unknown>)[key],
      budget,
      depth + 1
    )
    count++
  }
  return result
}

function sanitizeMessage(message: NativeChatMessage): NativeChatMessage {
  return { ...message, blocks: message.blocks.map(clipBlock) }
}

function sanitizeAppendForClient(
  messages: readonly NativeChatMessage[],
  clientKind: RpcContext['clientKind']
): NativeChatMessage[] {
  return clientKind === 'mobile' ? messages.map(sanitizeMessage) : messages.slice()
}

/** Window a transcript to its most recent `limit` messages so a long session
 *  can't freeze the client. Windowing by count applies to ALL RPC clients —
 *  shipping thousands of turns over the paired link is bad for web and mobile
 *  alike. Char-clipping (the mobile-only payload diet) is applied separately. */
function windowTranscript(
  messages: readonly NativeChatMessage[],
  limit = MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
): NativeChatMessage[] {
  const window = Math.min(Math.max(limit, 1), MOBILE_NATIVE_CHAT_MAX_WINDOW)
  return messages.length > window ? messages.slice(-window) : messages.slice()
}

/** Apply the windowed slice plus, for `mobile` clients only, oversized-block
 *  char truncation. Web/desktop (`runtime`, or undefined for in-process callers)
 *  are full-class surfaces and pass block bodies through untruncated — matching
 *  the desktop IPC path, which never clips. */
function windowForClient(
  messages: readonly NativeChatMessage[],
  clientKind: RpcContext['clientKind'],
  limit = MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
): NativeChatMessage[] {
  const windowed = windowTranscript(messages, limit)
  return clientKind === 'mobile' ? windowed.map(sanitizeMessage) : windowed
}

export async function handleNativeChatReadSession(
  params: NativeChatSessionInput,
  { clientKind }: RpcContext
) {
  const limit = params.limit ?? MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
  const result = await readNativeChatTranscriptTail({
    agent: params.agent,
    sessionId: params.sessionId,
    transcriptPath: params.transcriptPath,
    limit,
    beforeOffset: params.beforeOffset
  })
  return 'messages' in result
    ? {
        messages: windowForClient(result.messages, clientKind, limit),
        hasMore: result.hasMore,
        beforeOffset: result.beforeOffset
      }
    : result
}

export function handleNativeChatUnsubscribe(
  params: NativeChatUnsubscribeInput,
  { runtime, connectionId }: RpcContext
) {
  const connection = connectionId ?? 'local'
  if (params.subscriptionId) {
    runtime.cleanupSubscription(`nativeChat:${connection}:${params.subscriptionId}`)
    return { unsubscribed: true as const }
  }
  runtime.cleanupSubscriptionsByPrefix(`nativeChat:${connection}:`)
  return { unsubscribed: true as const }
}

// Why: Phase 6 D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from orpc/router-direct.ts via
// `wireRuntimeStream` instead of through a `defineStreamingMethod` legacy
// registration (same split as settings-events.ts/ui-events.ts).
export async function handleNativeChatSubscribe(
  params: NativeChatSessionInput,
  { runtime, connectionId, clientKind, signal }: RpcContext,
  emit: (event: RuntimeNativeChatSubscriptionEvent) => void
): Promise<void> {
  let closed = false
  let unsubscribe = (): void => {}
  let removeAbortListener = (): void => {}
  let resolveSubscription = (): void => {}
  const subscriptionClosed = new Promise<void>((resolve) => {
    resolveSubscription = resolve
  })
  // Why: the first drain is a bounded tail snapshot; later drains emit only
  // appended turns. This avoids parsing or shipping full long transcripts.
  // Clients merge by message id, so the initial windowed batch doubles as the
  // snapshot. Keyed by the client-supplied subscriptionId when present so
  // registration and unsubscribe derive from the same token; otherwise by
  // agent:sessionId, which is exactly the token existing mobile clients send to
  // unsubscribe (no wire break).
  const cleanupToken = params.subscriptionId ?? `${params.agent}:${params.sessionId}`
  const subscriptionId = `nativeChat:${connectionId ?? 'local'}:${cleanupToken}`
  const limit = params.limit ?? MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
  runtime.registerSubscriptionCleanup(
    subscriptionId,
    () => {
      if (closed) {
        return
      }
      closed = true
      removeAbortListener()
      unsubscribe()
      emit({ type: 'end' })
      resolveSubscription()
    },
    connectionId
  )
  removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
  if (closed) {
    return
  }
  const pendingSubscription = subscribeNativeChatTranscript({
    agent: params.agent,
    sessionId: params.sessionId,
    transcriptPath: params.transcriptPath,
    initialLimit: limit,
    onInitialSnapshot: (messages, hasMore, beforeOffset, error) => {
      if (closed) {
        return
      }
      // Forward an initial-drain error so a watching client's first frame carries it
      // instead of stranding the view at 'loading' when the read keeps throwing.
      emit({
        type: 'snapshot',
        messages: windowForClient(messages, clientKind, limit),
        hasMore,
        beforeOffset,
        ...(error ? { error } : {})
      })
    },
    onReplace: (messages, hasMore, beforeOffset) => {
      if (closed) {
        return
      }
      emit({
        type: 'replacement',
        messages: windowForClient(messages, clientKind, limit),
        hasMore,
        beforeOffset
      })
    },
    onAppend: (messages) => {
      if (closed) {
        return
      }
      emit({ type: 'appended', messages: sanitizeAppendForClient(messages, clientKind) })
    }
  })
  const subscription = await Promise.race([
    pendingSubscription,
    subscriptionClosed.then(() => null)
  ]).catch((error: unknown) => {
    runtime.cleanupSubscription(subscriptionId)
    throw error
  })
  if (!subscription) {
    // Why: transcript discovery cannot be synchronously cancelled. If it
    // finishes after iterator cancellation, dispose the late watcher alone.
    void pendingSubscription.then((created) => created.unsubscribe()).catch(() => {})
    return
  }
  // The connection may have closed while the file was being resolved.
  if (closed) {
    subscription.unsubscribe()
    return
  }
  if (!subscription.watching) {
    emit({ type: 'snapshot', messages: [], hasMore: false, error: 'Transcript unavailable' })
  }
  unsubscribe = subscription.unsubscribe
  await subscriptionClosed
}
