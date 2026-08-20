import type { NativeChatMessage } from '@yiru/workbench-model/agent'

import { compareMessages } from './session/assembler'

// Why: callers can supply unordered messages, so the renderer reapplies the assembler's ordering.
export function orderNativeChatMessages(messages: NativeChatMessage[]): NativeChatMessage[] {
  return [...messages].sort(compareMessages)
}
