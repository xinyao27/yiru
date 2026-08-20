import type { NativeChatMessage } from '@yiru/workbench-model/agent'
import { z } from 'zod'

import type {
  RuntimeNativeChatReadSessionResult,
  RuntimeNativeChatSubscriptionEvent
} from './contract/native-chat.js' with { 'resolution-mode': 'import' }

export const MOBILE_NATIVE_CHAT_READ_SESSION_ORPC_PATH = '/nativeChat/readSession'
export const MOBILE_NATIVE_CHAT_SUBSCRIBE_ORPC_PATH = '/nativeChat/subscribe'

export const MobileNativeChatSessionRequestSchema = z.object({
  agent: z.string().min(1),
  sessionId: z.string().min(1),
  limit: z.number().int().positive().optional(),
  subscriptionId: z.string().min(1).optional(),
  transcriptPath: z.string().min(1).optional(),
  beforeOffset: z.number().int().nonnegative().optional()
})

export const MobileNativeChatBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    name: z.string(),
    input: z.unknown(),
    callId: z.string().optional()
  }),
  z.object({
    type: z.literal('tool-result'),
    output: z.string(),
    isError: z.boolean().optional(),
    callId: z.string().optional(),
    outputSegments: z.array(z.string()).optional()
  }),
  z.object({
    type: z.literal('image-ref'),
    path: z.string().optional(),
    url: z.string().optional(),
    alt: z.string().optional()
  })
])

export const MobileNativeChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'tool', 'reasoning', 'system']),
  blocks: z.array(MobileNativeChatBlockSchema),
  timestamp: z.number().nullable(),
  source: z.enum(['transcript', 'hook', 'scrape']),
  turnId: z.string().optional()
})

export const MobileNativeChatReadResultSchema = z.union([
  z.object({
    messages: z.array(MobileNativeChatMessageSchema),
    hasMore: z.boolean(),
    beforeOffset: z.number().int().nonnegative()
  }),
  z.object({ error: z.string(), notFound: z.literal(true).optional() })
])

export const MobileNativeChatSubscriptionEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    messages: z.array(MobileNativeChatMessageSchema),
    hasMore: z.boolean(),
    beforeOffset: z.number().int().nonnegative().optional(),
    error: z.string().optional()
  }),
  z.object({
    type: z.literal('replacement'),
    messages: z.array(MobileNativeChatMessageSchema),
    hasMore: z.boolean(),
    beforeOffset: z.number().int().nonnegative()
  }),
  z.object({ type: z.literal('appended'), messages: z.array(MobileNativeChatMessageSchema) }),
  z.object({ type: z.literal('end') })
])

export const MOBILE_NATIVE_CHAT_MESSAGE_WIRE_IS_COMPATIBLE: NativeChatMessage extends z.infer<
  typeof MobileNativeChatMessageSchema
>
  ? true
  : false = true
export const MOBILE_NATIVE_CHAT_READ_WIRE_IS_COMPATIBLE: RuntimeNativeChatReadSessionResult extends z.infer<
  typeof MobileNativeChatReadResultSchema
>
  ? true
  : false = true
export const MOBILE_NATIVE_CHAT_EVENT_WIRE_IS_COMPATIBLE: RuntimeNativeChatSubscriptionEvent extends z.infer<
  typeof MobileNativeChatSubscriptionEventSchema
>
  ? true
  : false = true
