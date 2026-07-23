import type { NativeChatMessage } from '@yiru/workbench-model/agent'
import type { AgentStatusState, AgentType } from '@yiru/workbench-model/agent'
import { useEffect, useRef } from 'react'

import type { NativeChatSessionTransport } from './native-chat-session-transport'

export function useNativeChatCompletionRefresh(args: {
  agent: AgentType
  sessionId: string | null
  transcriptPath?: string | null
  transport: NativeChatSessionTransport
  state: AgentStatusState | null
  stateStartedAt: number | null
  limit: number
  onMessages: (messages: NativeChatMessage[]) => void
}): void {
  const { agent, sessionId, transcriptPath, transport, state, stateStartedAt, limit, onMessages } =
    args
  const appliedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (state !== 'done' || !sessionId || stateStartedAt === null) {
      return
    }
    const key = `${agent}\0${sessionId}\0${stateStartedAt}`
    if (appliedKeyRef.current === key) {
      return
    }
    let cancelled = false
    // Why: filesystem tail notifications can miss the final append; the done
    // hook is an independent boundary where one authoritative read is cheap.
    void transport
      .readSession(agent, sessionId, limit, transcriptPath ?? undefined)
      .then((result) => {
        if (cancelled || !result || 'error' in result) {
          return
        }
        appliedKeyRef.current = key
        onMessages(result.messages)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [agent, sessionId, transcriptPath, transport, state, stateStartedAt, limit, onMessages])
}
