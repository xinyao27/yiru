import { z } from 'zod'

import type { RuntimeClientEventSubscriptionEvent } from './contract/client-events.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_CLIENT_EVENTS_SUBSCRIBE_ORPC_PATH = '/runtime/clientEvents/subscribe'
export const MOBILE_CLIENT_EVENTS_UNSUBSCRIBE_ORPC_PATH = '/runtime/clientEvents/unsubscribe'

export const MobileClientEventSubscriptionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), subscriptionId: z.string().min(1) }),
  z.object({ type: z.literal('reposChanged') }),
  z.object({
    type: z.literal('worktreesChanged'),
    repoId: z.string(),
    renamed: z.object({ oldWorktreeId: z.string(), newWorktreeId: z.string() }).optional()
  }),
  z.object({
    type: z.literal('activateWorktree'),
    repoId: z.string(),
    worktreeId: z.string()
  }),
  z.object({
    type: z.literal('worktreeHeadIdentitiesChanged'),
    repoId: z.string(),
    identities: z.array(
      z.object({
        worktreePath: z.string(),
        head: z.string(),
        branch: z.string().nullable()
      })
    )
  }),
  z.object({ type: z.literal('end') })
])

export const MobileClientEventsUnsubscribeRequestSchema = z.object({
  subscriptionId: z.string().min(1)
})

export const MOBILE_CLIENT_EVENT_WIRE_IS_COMPATIBLE: RuntimeClientEventSubscriptionEvent extends z.infer<
  typeof MobileClientEventSubscriptionSchema
>
  ? true
  : false = true
