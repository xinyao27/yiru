import type {
  NotificationDismissManyInput,
  NotificationDismissManyOutput,
  NotificationGetMissedSinceInput,
  NotificationReportInput,
  NotificationReportOutput,
  NotificationUnsubscribeInput,
  ReplayableMobileNotification,
  RuntimeNotificationSubscriptionEvent
} from '@yiru/runtime-protocol/contract'
import type { AgentStatusState, AgentType } from '@yiru/runtime-protocol/model/agent'
import type { NotificationDispatchRequest } from '@yiru/runtime-protocol/workbench/types'
import {
  buildNotificationOptions,
  getEffectiveNotificationSoundId
} from '~main/notifications/notification-options'
import { signalNotificationShellAttention } from '~main/runtime/notification-shell-attention'

import type { RpcContext } from '../core'
import {
  displayShellNotification,
  dismissShellNotifications
} from '../orpc/shell-services-notification-client'
import { bindSubscriptionAbort } from './subscription-abort'

// Why: monotonically increasing per-process counter eliminates the
// Date.now() collision that could fire when two near-simultaneous
// notifications.subscribe calls landed on the same millisecond.
let notificationsSubscriptionSeq = 0

// Why: notifications.getMissedSince is the catch-up RPC for mobile reconnect
// (#8129). The client passes the highest seq it has already delivered; the
// runtime returns only notifications dispatched after that seq. Because the
// desktop assigns a monotonic seq to every dispatched notification, the cut is
// exact and idempotent — re-requesting with the same watermark can never
// return an already-delivered event, so reconnects never duplicate local
// pushes (the adversarial-review gate for #8129).
export function unsubscribeRuntimeNotifications(
  params: NotificationUnsubscribeInput,
  { runtime }: RpcContext
): { unsubscribed: boolean } {
  runtime.cleanupSubscription(params.subscriptionId)
  return { unsubscribed: true }
}

export function getMissedRuntimeNotifications(
  params: NotificationGetMissedSinceInput,
  { mobileNotifications }: RpcContext
): { notifications: ReplayableMobileNotification[] } {
  const missed = mobileNotifications.getMissedSince(params.lastSeenSeq)
  return { notifications: missed }
}

// Why: the contract widens agentType/agentState to `string` (the contract
// package can't import desktop's AgentType/AgentStatusState unions);
// buildNotificationOptions only pattern-matches known literal values via
// AGENT_TYPE_LABELS/known state checks and falls back gracefully for
// anything else, so narrowing back here is safe.
function toNotificationDispatchRequest(
  params: NotificationReportInput
): NotificationDispatchRequest {
  return {
    ...params,
    agentType: params.agentType as AgentType | undefined,
    agentState: params.agentState as AgentStatusState | undefined
  }
}

/**
 * notifications.report — Phase 5 slice S3's forward leg. Owns job1 (settings/
 * throttle/dedup judgment) and job2 (the mobile replay stream, unaffected —
 * already a forward contract from an earlier phase), then reverse-calls the
 * shell for job3 (driving the OS notification centre). See
 * shell-services-reverse-link.ts and main/notifications/notifications.ts's
 * `notifications:displayNative` handler for the shell side.
 */
export async function reportRuntimeNotification(
  params: NotificationReportInput,
  ctx: RpcContext
): Promise<NotificationReportOutput> {
  const { runtime, mobileNotifications, shellConnectionId } = ctx

  signalNotificationShellAttention(params.source)

  const settings = runtime.getNotificationSettings()
  if (!settings || !settings.enabled) {
    return { delivered: false, reason: 'disabled' }
  }
  if (
    (params.source === 'agent-task-complete' && !settings.agentTaskComplete) ||
    (params.source === 'terminal-bell' && !settings.terminalBell)
  ) {
    return { delivered: false, reason: 'source-disabled' }
  }

  const notificationOptions = buildNotificationOptions(toNotificationDispatchRequest(params))

  // Why: desktop focus only means this computer has the worktree visible;
  // the paired phone may be locked or elsewhere and still needs the alert.
  if (params.source !== 'test') {
    const mobileDedupeKey = params.worktreeId ?? params.worktreeLabel ?? 'global'
    if (runtime.mobileNotificationCooldown.reserve(mobileDedupeKey, Date.now())) {
      mobileNotifications.dispatch({
        type: 'notification',
        source: params.source,
        title: notificationOptions.title,
        body: notificationOptions.body,
        worktreeId: params.worktreeId,
        ...(params.notificationId ? { notificationId: params.notificationId } : {})
      })
    }
  }

  // Why: the Settings test button is an explicit user action, often clicked
  // repeatedly while tuning sounds, so it must bypass burst dedupe — matches
  // the pre-split gate exactly (test source never reserves or rolls back).
  let desktopCooldownKey: string | null = null
  if (params.source !== 'test') {
    desktopCooldownKey = params.worktreeId ?? params.worktreeLabel ?? 'global'
    if (!runtime.desktopNotificationCooldown.reserve(desktopCooldownKey, Date.now())) {
      return { delivered: false, reason: 'cooldown' }
    }
  }

  const result = await displayShellNotification(shellConnectionId, {
    source: params.source,
    notificationId: params.notificationId,
    worktreeId: params.worktreeId,
    paneKey: params.paneKey,
    title: notificationOptions.title,
    body: notificationOptions.body,
    useSystemSound: getEffectiveNotificationSoundId(settings) === 'system',
    suppressWhenFocused: settings.suppressWhenFocused === true && params.isActiveWorktree === true,
    requireDisplayConfirmation: params.requireDisplayConfirmation
  })

  if (!result.ok) {
    // Why: the shell never got to judge focus, so the reservation above would
    // otherwise be spent on a report nothing displayed for — roll it back the
    // same way a `suppressed-focus` verdict does below.
    if (desktopCooldownKey) {
      runtime.desktopNotificationCooldown.rollback(desktopCooldownKey)
    }
    return { delivered: false, reason: 'shell-unavailable' }
  }
  if (result.reason === 'suppressed-focus' && desktopCooldownKey) {
    // Why: a focus-suppressed attempt is not a real delivery attempt — undo
    // the reservation so a genuine notification moments later (e.g. right
    // after the user unfocuses the window) isn't blocked by this one's
    // cooldown, matching the pre-split ordering where the focus check ran
    // before the cooldown was ever reserved.
    runtime.desktopNotificationCooldown.rollback(desktopCooldownKey)
  }
  return { delivered: result.delivered, ...(result.reason ? { reason: result.reason } : {}) }
}

export async function dismissRuntimeNotifications(
  params: NotificationDismissManyInput,
  ctx: RpcContext
): Promise<NotificationDismissManyOutput> {
  const uniqueIds = Array.from(new Set(params.notificationIds.filter((id) => id.length > 0)))
  for (const id of uniqueIds) {
    ctx.mobileNotifications.dismiss(id)
  }
  const result = await dismissShellNotifications(ctx.shellConnectionId, {
    notificationIds: uniqueIds
  })
  return { dismissed: result.ok ? result.dismissed : 0 }
}

// Why: notifications.subscribe streams desktop notification events to mobile
// clients over WebSocket. The mobile client shows a local push notification
// for each event. This avoids requiring Firebase/APNs — the existing
// persistent WebSocket connection doubles as the push channel. Phase 6
// D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from orpc/router-direct.ts via
// `wireRuntimeStream` instead of through a `defineStreamingMethod` legacy
// registration (same split as settings-events.ts/ui-events.ts).
export async function handleNotificationsSubscribe(
  _params: void,
  { runtime, mobileNotifications, connectionId, signal }: RpcContext,
  emit: (event: RuntimeNotificationSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = mobileNotifications.subscribe((event) => {
      emit(event)
    })

    // Why: scope by per-ws connectionId + per-process counter so
    // concurrent subscribes never collide on the cleanup map.
    const seq = ++notificationsSubscriptionSeq
    const subscriptionId = `notifications-${connectionId ?? 'inproc'}-${seq}`
    runtime.registerSubscriptionCleanup(
      subscriptionId,
      () => {
        if (closed) {
          return
        }
        closed = true
        removeAbortListener()
        unsubscribe()
        emit({ type: 'end' })
        resolve()
      },
      connectionId
    )
    removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
    if (closed) {
      return
    }

    emit({ type: 'ready', subscriptionId })
  })
}
