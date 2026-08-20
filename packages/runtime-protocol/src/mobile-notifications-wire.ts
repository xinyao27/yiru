import { z } from 'zod'

import type {
  ReplayableMobileNotification,
  RuntimeNotificationSubscriptionEvent
} from './contract/notifications.js' with { 'resolution-mode': 'import' }

export const MOBILE_NOTIFICATIONS_SUBSCRIBE_ORPC_PATH = '/notifications/subscribe'
export const MOBILE_NOTIFICATIONS_UNSUBSCRIBE_ORPC_PATH = '/notifications/unsubscribe'
export const MOBILE_NOTIFICATIONS_GET_MISSED_ORPC_PATH = '/notifications/getMissedSince'

const DispatchSchema = z.object({
  type: z.literal('notification'),
  source: z.enum(['agent-task-complete', 'terminal-bell', 'test']),
  title: z.string(),
  body: z.string(),
  worktreeId: z.string().optional(),
  notificationId: z.string().optional(),
  notificationSeq: z.number().int().positive().optional()
})
const DismissSchema = z.object({
  type: z.literal('dismiss'),
  notificationId: z.string(),
  notificationSeq: z.number().int().positive().optional()
})

export const MobileNotificationReplayEventSchema = z.discriminatedUnion('type', [
  DispatchSchema.extend({ notificationSeq: z.number().int().positive() }),
  DismissSchema.extend({ notificationSeq: z.number().int().positive() })
])

export const MobileNotificationSubscriptionEventSchema = z.discriminatedUnion('type', [
  DispatchSchema,
  DismissSchema,
  z.object({ type: z.literal('ready'), subscriptionId: z.string().min(1) }),
  z.object({ type: z.literal('end') })
])
export const MobileNotificationGetMissedRequestSchema = z.object({
  lastSeenSeq: z.number().int().nonnegative()
})
export const MobileNotificationGetMissedResultSchema = z.object({
  notifications: z.array(MobileNotificationReplayEventSchema)
})
export const MobileNotificationUnsubscribeRequestSchema = z.object({
  subscriptionId: z.string().min(1)
})
export const MobileNotificationUnsubscribeResultSchema = z.object({ unsubscribed: z.boolean() })

export const MOBILE_NOTIFICATION_EVENT_WIRE_IS_COMPATIBLE: RuntimeNotificationSubscriptionEvent extends z.infer<
  typeof MobileNotificationSubscriptionEventSchema
>
  ? true
  : false = true
export const MOBILE_NOTIFICATION_REPLAY_WIRE_IS_COMPATIBLE: ReplayableMobileNotification extends z.infer<
  typeof MobileNotificationReplayEventSchema
>
  ? true
  : false = true
