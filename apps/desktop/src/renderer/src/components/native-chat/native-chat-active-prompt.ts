import type { AgentStatusState } from '../../../../shared/agent-status-types'
import { isTextBlock, type NativeChatMessage } from '../../../../shared/native-chat-types'
import { isPendingMessageId, type NativeChatPendingSend } from './native-chat-pending'
import { normalizeNativeChatPendingText } from './native-chat-pending-occurrence'

export const NATIVE_CHAT_ACTIVE_PROMPT_ID_PREFIX = 'active-prompt:'

export type NativeChatActivePromptPresentation = {
  activePromptMessage: NativeChatMessage | null
  queuedPendingMessages: NativeChatMessage[]
}

export function deriveNativeChatActivePrompt(args: {
  pending: readonly NativeChatPendingSend[]
  pendingMessages: NativeChatMessage[]
  existingMessages: readonly NativeChatMessage[]
  prompt: string | null | undefined
  state: AgentStatusState | null
  statusUpdatedAt: number | null
}): NativeChatActivePromptPresentation {
  const { pending, pendingMessages, existingMessages, prompt, state, statusUpdatedAt } = args
  const normalizedPrompt = normalizeNativeChatPendingText(prompt ?? '')
  if ((state !== 'working' && state !== 'done') || !normalizedPrompt || statusUpdatedAt === null) {
    return { activePromptMessage: null, queuedPendingMessages: pendingMessages }
  }

  const visibleIds = new Set(
    pendingMessages.filter((message) => isPendingMessageId(message.id)).map((message) => message.id)
  )
  const candidates = pending.filter(
    (entry) => visibleIds.has(`pending:${entry.id}`) && entry.sentAt <= statusUpdatedAt
  )
  const match = findPromptMatch(candidates, normalizedPrompt)
  if (!match) {
    return { activePromptMessage: null, queuedPendingMessages: pendingMessages }
  }

  const consumedIds = new Set(match.map((entry) => `pending:${entry.id}`))
  const first = match[0]!
  const last = match.at(-1)!
  const queuedPendingMessages = pendingMessages.filter((message) => !consumedIds.has(message.id))
  if (findTranscriptPromptIndex(existingMessages, first, normalizedPrompt) >= 0) {
    return { activePromptMessage: null, queuedPendingMessages }
  }
  const imagePaths = match.flatMap((entry) => entry.imagePaths ?? [])
  // Why: the hook prompt is the authoritative turn boundary when rapid textarea
  // submissions were joined by the hosted TUI before its Enter was processed.
  const activePromptMessage: NativeChatMessage = {
    id: `${NATIVE_CHAT_ACTIVE_PROMPT_ID_PREFIX}${first.id}:${last.id}`,
    role: 'user',
    blocks: [
      ...imagePaths.map((path) => ({ type: 'image-ref' as const, path })),
      { type: 'text', text: prompt!.trim() }
    ],
    timestamp: first.sentAt,
    source: 'hook'
  }
  return {
    activePromptMessage,
    queuedPendingMessages
  }
}

export function isNativeChatActivePromptMessageId(id: string): boolean {
  return id.startsWith(NATIVE_CHAT_ACTIVE_PROMPT_ID_PREFIX)
}

export function pruneConfirmedNativeChatActivePrompt(args: {
  pending: NativeChatPendingSend[]
  existingMessages: readonly NativeChatMessage[]
  prompt: string | null | undefined
  state: AgentStatusState | null
  statusUpdatedAt: number | null
}): NativeChatPendingSend[] {
  const { pending, existingMessages, prompt, state, statusUpdatedAt } = args
  const normalizedPrompt = normalizeNativeChatPendingText(prompt ?? '')
  if (
    pending.length === 0 ||
    (state !== 'working' && state !== 'done') ||
    !normalizedPrompt ||
    statusUpdatedAt === null
  ) {
    return pending
  }
  const match = findPromptMatch(
    pending.filter((entry) => entry.sentAt <= statusUpdatedAt),
    normalizedPrompt
  )
  if (!match) {
    return pending
  }
  const promptIndex = findTranscriptPromptIndex(existingMessages, match[0]!, normalizedPrompt)
  const advanced =
    promptIndex >= 0 &&
    existingMessages.slice(promptIndex + 1).some((message) => message.role !== 'user')
  if (!advanced) {
    return pending
  }
  const consumedIds = new Set(match.map((entry) => entry.id))
  return pending.filter((entry) => !consumedIds.has(entry.id))
}

function findPromptMatch(
  pending: readonly NativeChatPendingSend[],
  normalizedPrompt: string
): NativeChatPendingSend[] | null {
  let match: NativeChatPendingSend[] | null = null
  for (let start = 0; start < pending.length; start += 1) {
    let combined = ''
    for (let end = start; end < pending.length; end += 1) {
      combined += pending[end]!.text
      if (normalizeNativeChatPendingText(combined) === normalizedPrompt) {
        match = pending.slice(start, end + 1)
      }
    }
  }
  return match
}

function findTranscriptPromptIndex(
  messages: readonly NativeChatMessage[],
  firstPending: NativeChatPendingSend,
  normalizedPrompt: string
): number {
  const boundaryIndex = firstPending.afterMessageId
    ? messages.findIndex((message) => message.id === firstPending.afterMessageId)
    : -1
  for (let index = messages.length - 1; index > boundaryIndex; index -= 1) {
    const message = messages[index]!
    if (message.role !== 'user') {
      continue
    }
    const text = message.blocks
      .filter(isTextBlock)
      .map((block) => block.text)
      .join(' ')
    if (normalizeNativeChatPendingText(text) === normalizedPrompt) {
      return index
    }
  }
  return -1
}
