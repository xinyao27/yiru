import type { ShellServicesNotificationsDismissOutput } from '@yiru/runtime-protocol/contract'
import type { Notification } from 'electron'

const NOTIFICATION_DISPLAY_CONFIRMATION_TIMEOUT_MS = 2500
const NOTIFICATION_RELEASE_FALLBACK_MS = 5 * 60 * 1000

const activeNotifications = new Set<Notification>()
const activeNotificationsById = new Map<
  string,
  { notification: Notification; release: () => void }
>()

export function retainNotificationUntilRelease(
  notification: Notification,
  notificationId?: string,
  onRelease?: () => void
): () => void {
  const previous = notificationId ? activeNotificationsById.get(notificationId) : null
  if (previous) {
    previous.notification.close()
    previous.release()
  }
  activeNotifications.add(notification)
  let released = false
  let releaseTimer: ReturnType<typeof setTimeout> | null = null
  const entry = notificationId ? { notification, release: () => {} } : null

  function release(): void {
    if (released) {
      return
    }
    released = true
    activeNotifications.delete(notification)
    notification.removeListener('close', release)
    if (releaseTimer) {
      clearTimeout(releaseTimer)
      releaseTimer = null
    }
    if (notificationId && activeNotificationsById.get(notificationId) === entry) {
      activeNotificationsById.delete(notificationId)
    }
    onRelease?.()
  }

  if (entry && notificationId) {
    entry.release = release
    activeNotificationsById.set(notificationId, entry)
  }
  notification.on('close', release)
  releaseTimer = setTimeout(release, NOTIFICATION_RELEASE_FALLBACK_MS)
  if (typeof releaseTimer.unref === 'function') {
    releaseTimer.unref()
  }
  return release
}

export function dismissNativeNotifications(
  notificationIds: string[]
): ShellServicesNotificationsDismissOutput {
  const uniqueIds = new Set(notificationIds.filter((id) => id.length > 0))
  let dismissed = 0
  for (const id of uniqueIds) {
    const entry = activeNotificationsById.get(id)
    if (entry) {
      entry.notification.close()
      entry.release()
      dismissed += 1
    }
  }
  return { dismissed }
}

export function waitForNotificationDisplay(notification: Notification): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    function cleanup(): void {
      notification.removeListener('show', onShow)
      notification.removeListener('failed', onFailed)
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
    function settle(displayed: boolean): void {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(displayed)
    }
    function onShow(): void {
      settle(true)
    }
    function onFailed(): void {
      settle(false)
    }

    notification.once('show', onShow)
    notification.once('failed', onFailed)
    timer = setTimeout(() => settle(false), NOTIFICATION_DISPLAY_CONFIRMATION_TIMEOUT_MS)
  })
}

export function logNativeNotificationFailure(context: string, error?: string): void {
  console.warn(
    `[notifications] ${context} notification failed to show${error ? `: ${error}` : '.'}`
  )
}
