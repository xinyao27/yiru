import { translate } from '../i18n/translate'
import type { MobileDeviceStore } from '../mobile/devices'
import type { MobileNotificationChannel } from '../notifications/channel'
import { daemonImplementation } from './contract'

export function createNotificationRouter(
  notifications: MobileNotificationChannel,
  devices: MobileDeviceStore
) {
  return {
    dismiss: daemonImplementation.notifications.dismiss.handler(({ input }) => {
      const uniqueIds = [...new Set(input.notificationIds.filter(Boolean))]
      for (const id of uniqueIds) {
        notifications.dismiss(id)
      }
      return { dismissed: uniqueIds.length }
    }),
    getMissedSince: daemonImplementation.notifications.getMissedSince.handler(({ input }) => ({
      notifications: notifications.missedSince(input.lastSeenSeq)
    })),
    registerPush: daemonImplementation.notifications.registerPush.handler(({ context, input }) => {
      if (context.client !== 'mobile') {
        throw new Error('mobile_push_registration_requires_mobile_client')
      }
      const registration =
        input.token && input.environment
          ? { environment: input.environment, token: input.token }
          : null
      return { registered: devices.registerPush(context.deviceId, registration) }
    }),
    report: daemonImplementation.notifications.report.handler(({ input }) => {
      notifications.dispatch({
        body:
          input.agentLastAssistantMessage ||
          input.terminalTitle ||
          translate('Open Yiru to review'),
        ...(input.notificationId ? { notificationId: input.notificationId } : {}),
        source: input.source,
        title: input.repoLabel || translate('Yiru'),
        type: 'notification',
        ...(input.worktreeId ? { worktreeId: input.worktreeId } : {})
      })
      return { delivered: true }
    }),
    subscribe: daemonImplementation.notifications.subscribe.handler(async function* ({ signal }) {
      const afterSequence = notifications.latestSequence()
      const subscription = notifications.openSubscription()
      const combinedSignal = signal
        ? AbortSignal.any([signal, subscription.signal])
        : subscription.signal
      try {
        yield { subscriptionId: subscription.id, type: 'ready' as const }
        for await (const event of notifications.subscribe(afterSequence, combinedSignal)) {
          yield event
        }
        yield { type: 'end' as const }
      } finally {
        notifications.closeSubscription(subscription.id)
      }
    }),
    unsubscribe: daemonImplementation.notifications.unsubscribe.handler(({ input }) => ({
      unsubscribed: notifications.closeSubscription(input.subscriptionId)
    }))
  }
}
