import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type MobileNotificationDispatchEvent = {
  type: 'notification'
  source: 'agent-task-complete' | 'terminal-bell' | 'test'
  title: string
  body: string
  worktreeId?: string
  notificationId?: string
  notificationSeq?: number
}

export type MobileNotificationDismissEvent = {
  type: 'dismiss'
  notificationId: string
  notificationSeq?: number
}

export type ReplayableMobileNotification = (
  | MobileNotificationDispatchEvent
  | MobileNotificationDismissEvent
) & {
  notificationSeq: number
}

export type RuntimeNotificationSubscriptionEvent =
  | ReplayableMobileNotification
  | { type: 'ready'; subscriptionId: string }
  | { type: 'end' }

export const NotificationUnsubscribeInputSchema = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

export const NotificationGetMissedSinceInputSchema = z.object({
  lastSeenSeq: z.number().int().min(0, 'lastSeenSeq must be a non-negative integer')
})

export type NotificationUnsubscribeInput = z.output<typeof NotificationUnsubscribeInputSchema>
export type NotificationGetMissedSinceInput = z.output<typeof NotificationGetMissedSinceInputSchema>

// Why: Phase 5 slice S3 — the shell reports a notification-worthy event to the
// runtime (settings/throttle/dedup judgment + the mobile replay stream, both
// already host-owned). `agentType`/`agentState` are widened to `string`
// because this contract package cannot import desktop's `AgentType`/
// `AgentStatusState` unions (same widen-then-narrow-cast pattern as Phase 4's
// `settings.previewGhosttyImport`); the handler casts back with a `Why:` note.
export const NotificationReportInputSchema = z
  .object({
    source: z.enum(['agent-task-complete', 'terminal-bell', 'test']),
    notificationId: z.string().optional(),
    requireDisplayConfirmation: z.boolean().optional(),
    worktreeId: z.string().optional(),
    paneKey: z.string().optional(),
    repoLabel: z.string().optional(),
    worktreeLabel: z.string().optional(),
    hasMultipleActiveRepos: z.boolean().optional(),
    terminalTitle: z.string().optional(),
    isActiveWorktree: z.boolean().optional(),
    agentType: z.string().optional(),
    agentState: z.string().optional(),
    agentPrompt: z.string().optional(),
    agentToolName: z.string().optional(),
    agentToolInput: z.string().optional(),
    agentLastAssistantMessage: z.string().optional(),
    agentInterrupted: z.boolean().optional()
  })
  .strict()

export type NotificationReportInput = z.output<typeof NotificationReportInputSchema>

export const NotificationReportOutputSchema = z
  .object({
    delivered: z.boolean(),
    reason: z
      .enum([
        'disabled',
        'source-disabled',
        'suppressed-focus',
        'cooldown',
        'not-supported',
        'not-displayed',
        'blocked-by-system',
        'shell-unavailable'
      ])
      .optional()
  })
  .strict()

export type NotificationReportOutput = z.output<typeof NotificationReportOutputSchema>

export const NotificationDismissManyInputSchema = z
  .object({ notificationIds: z.array(z.string()) })
  .strict()

export type NotificationDismissManyInput = z.output<typeof NotificationDismissManyInputSchema>

export const NotificationDismissManyOutputSchema = z.object({ dismissed: z.number() }).strict()

export type NotificationDismissManyOutput = z.output<typeof NotificationDismissManyOutputSchema>

const NOTIFICATION_ACCESS = { scope: 'host', tier: 'read' } as const
const NOTIFICATION_REPORT_ACCESS = { scope: 'host', tier: 'control' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const notificationsContract = {
  subscribe: withAccess(NOTIFICATION_ACCESS, MOBILE_CLIENT)
    .input(z.void())
    .output(eventIterator(type<RuntimeNotificationSubscriptionEvent>())),
  unsubscribe: withAccess(NOTIFICATION_ACCESS, MOBILE_CLIENT)
    .input(NotificationUnsubscribeInputSchema)
    .output(type<{ unsubscribed: boolean }>()),
  getMissedSince: withAccess(NOTIFICATION_ACCESS, MOBILE_CLIENT)
    .input(NotificationGetMissedSinceInputSchema)
    .output(type<{ notifications: ReplayableMobileNotification[] }>()),
  report: withAccess(NOTIFICATION_REPORT_ACCESS)
    .input(NotificationReportInputSchema)
    .output(NotificationReportOutputSchema),
  dismiss: withAccess(NOTIFICATION_REPORT_ACCESS)
    .input(NotificationDismissManyInputSchema)
    .output(NotificationDismissManyOutputSchema)
} satisfies ContractRouter<RuntimeProcedureMeta>
