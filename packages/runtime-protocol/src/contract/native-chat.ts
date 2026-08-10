import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import type { AgentType, NativeChatMessage } from '@yiru/workbench-model/agent'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export const MOBILE_NATIVE_CHAT_DEFAULT_WINDOW = 40
export const MOBILE_NATIVE_CHAT_MAX_WINDOW = 2000

export const NativeChatSessionSchema = z.object({
  agent: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing agent'))
    // Why: the legacy wire accepts every non-empty provider id; narrowing it here would break peers.
    .transform((value) => value as AgentType),
  sessionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing session id')),
  limit: z
    .number()
    .int()
    .positive()
    .transform((value) => Math.min(value, MOBILE_NATIVE_CHAT_MAX_WINDOW))
    .optional(),
  subscriptionId: z.string().min(1).optional(),
  transcriptPath: z.string().min(1).optional(),
  beforeOffset: z.number().int().nonnegative().optional()
})

export const NativeChatUnsubscribeSchema = z.object({
  subscriptionId: z.string().min(1).optional()
})

export type NativeChatSessionInput = z.infer<typeof NativeChatSessionSchema>
export type NativeChatUnsubscribeInput = z.infer<typeof NativeChatUnsubscribeSchema>

export type RuntimeNativeChatReadSessionResult =
  | {
      messages: NativeChatMessage[]
      hasMore: boolean
      beforeOffset: number
    }
  | { error: string; notFound?: true }

export type RuntimeNativeChatUnsubscribeResult = { unsubscribed: true }

export type RuntimeNativeChatSubscriptionEvent =
  | {
      type: 'snapshot'
      messages: NativeChatMessage[]
      hasMore: boolean
      beforeOffset?: number
      error?: string
    }
  | {
      type: 'replacement'
      messages: NativeChatMessage[]
      hasMore: boolean
      beforeOffset: number
    }
  | { type: 'appended'; messages: NativeChatMessage[] }
  | { type: 'end' }

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const WORKTREE_READ_ACCESS = { scope: 'worktree', tier: 'read' } as const
const MOBILE = { mobile: true } as const

export const nativeChatContract = {
  subscribe: withAccess(HOST_READ_ACCESS, MOBILE)
    .input(NativeChatSessionSchema)
    .output(eventIterator(type<RuntimeNativeChatSubscriptionEvent>())),
  readSession: withAccess(HOST_READ_ACCESS, MOBILE)
    .input(NativeChatSessionSchema)
    .output(type<RuntimeNativeChatReadSessionResult>()),
  unsubscribe: withAccess(WORKTREE_READ_ACCESS, MOBILE)
    .input(NativeChatUnsubscribeSchema)
    .output(type<RuntimeNativeChatUnsubscribeResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
