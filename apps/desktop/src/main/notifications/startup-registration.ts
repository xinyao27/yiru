import { Notification } from 'electron'

import { translateMain } from '../i18n/main-i18n'
import type { Store } from '../persistence'
import {
  logNativeNotificationFailure,
  retainNotificationUntilRelease
} from './native-notification-handles'
import {
  openNotificationSystemSettings,
  recordNotificationDeliveryOutcome
} from './notification-permission'

export function triggerStartupNotificationRegistration(store: Store): void {
  if (process.platform !== 'darwin' || !Notification.isSupported()) {
    return
  }
  if (store.getUI().notificationPermissionRequested) {
    return
  }
  store.updateUI({ notificationPermissionRequested: true })
  const notification = new Notification({
    title: translateMain('notifications.permissionRequest.title', 'Yiru is ready to notify you'),
    body: translateMain(
      'notifications.permissionRequest.body',
      'Allow notifications so Yiru can alert you when agents finish or terminals need attention.'
    )
  })
  let handled = false
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  const release = retainNotificationUntilRelease(notification, undefined, () => {
    notification.removeListener('click', onClick)
    notification.removeListener('show', onShow)
    notification.removeListener('failed', onFailed)
  })

  function clearTimers(): void {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }
  function cleanup(): void {
    if (handled) {
      return
    }
    handled = true
    clearTimers()
    notification.close()
    release()
  }
  function onClick(): void {
    cleanup()
    openNotificationSystemSettings()
  }
  function onShow(): void {
    // Why: the system permission sheet is independent of the banner, so the
    // banner can disappear without dismissing the user's decision UI.
    closeTimer = setTimeout(cleanup, 8000)
    if (typeof closeTimer.unref === 'function') {
      closeTimer.unref()
    }
  }
  function onFailed(_event: unknown, error?: string): void {
    logNativeNotificationFailure('startup registration', error)
    recordNotificationDeliveryOutcome('failed')
    cleanup()
  }

  notification.on('click', onClick)
  notification.on('show', onShow)
  notification.on('failed', onFailed)
  fallbackTimer = setTimeout(cleanup, 10_000)
  if (typeof fallbackTimer.unref === 'function') {
    fallbackTimer.unref()
  }
  notification.show()
}
