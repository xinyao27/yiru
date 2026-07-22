import { useMemo } from 'react'

import type { AgentStatusState } from '../../../../shared/agent-status-types'
import {
  deriveNativeChatStreamingText,
  nativeChatStreamingMessage
} from '../../../../shared/native-chat-streaming'
import { deriveNativeChatActivePrompt } from './native-chat-active-prompt'
import {
  commandMarkersAsMessages,
  pendingSendsAsMessages,
  type NativeChatCommandMarker,
  type NativeChatPendingSend
} from './native-chat-pending'
import type { NativeChatLiveSession } from './use-native-chat-live-session'

export function useNativeChatTransientSession(args: {
  session: NativeChatLiveSession
  pending: NativeChatPendingSend[]
  commandMarkers: NativeChatCommandMarker[]
  hookPrompt: string | null | undefined
  hookPreview: string | null | undefined
  hookState: AgentStatusState | null
  hookUpdatedAt: number | null
}): NativeChatLiveSession {
  const { session, pending, commandMarkers, hookPrompt, hookPreview, hookState, hookUpdatedAt } =
    args
  const pendingMessages = useMemo(
    () => pendingSendsAsMessages(pending, session.messages),
    [pending, session.messages]
  )
  const activePrompt = useMemo(
    () =>
      deriveNativeChatActivePrompt({
        pending,
        pendingMessages,
        existingMessages: session.messages,
        prompt: hookPrompt,
        state: hookState,
        statusUpdatedAt: hookUpdatedAt
      }),
    [pending, pendingMessages, session.messages, hookPrompt, hookState, hookUpdatedAt]
  )
  const streamingText = useMemo(
    () =>
      deriveNativeChatStreamingText({
        messages: [
          ...session.messages,
          ...(activePrompt.activePromptMessage ? [activePrompt.activePromptMessage] : []),
          ...activePrompt.queuedPendingMessages
        ],
        previewText: hookPreview,
        state: hookState
      }),
    [session.messages, activePrompt, hookPreview, hookState]
  )

  return useMemo(() => {
    if (pending.length === 0 && commandMarkers.length === 0 && !streamingText) {
      return session
    }
    return {
      ...session,
      messages: [
        ...session.messages,
        ...commandMarkersAsMessages(commandMarkers),
        ...(activePrompt.activePromptMessage ? [activePrompt.activePromptMessage] : []),
        ...(streamingText ? [nativeChatStreamingMessage(streamingText)] : []),
        ...activePrompt.queuedPendingMessages
      ]
    }
  }, [session, pending.length, commandMarkers, activePrompt, streamingText])
}
