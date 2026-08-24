import { Notification, shell } from 'electron'
import type {
  NotificationDeliveryProbeResult,
  NotificationPermissionStatusResult
} from '~shared/types'

import { translateMain } from '../i18n/main-i18n'
import type { Store } from '../persistence'
import { retainNotificationUntilRelease } from './native-notification-handles'
import { readNotificationAuthorizationStatus } from './notification-authorization-status'

const MACOS_PACKAGED_BUNDLE_ID = 'com.xinyao27.yiru'
const MACOS_NOTIFICATION_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
const NOTIFICATION_PROBE_RESULT_TIMEOUT_MS = 3000
const NOTIFICATION_PROBE_BANNER_CLOSE_DELAY_MS = 4000

let lastObservedDeliveryOutcome: 'delivered' | 'failed' | null = null
let deliveryProbeInFlight: Promise<NotificationDeliveryProbeResult> | null = null
let permissionDialogTriggeredThisSession = false

export function resetNotificationPermissionSession(): void {
  lastObservedDeliveryOutcome = null
  deliveryProbeInFlight = null
  permissionDialogTriggeredThisSession = false
}

export function recordNotificationDeliveryOutcome(outcome: 'delivered' | 'failed'): void {
  lastObservedDeliveryOutcome = outcome
}

export function openNotificationSystemSettings(): void {
  if (process.platform === 'darwin') {
    const bundleId = process.env.YIRU_DEV_MACOS_BUNDLE_ID ?? MACOS_PACKAGED_BUNDLE_ID
    const url = `${MACOS_NOTIFICATION_SETTINGS_URL}?id=${encodeURIComponent(bundleId)}`
    void shell.openExternal(url)
  } else if (process.platform === 'win32') {
    void shell.openExternal('ms-settings:notifications')
  }
}

export function getNotificationPermissionStatus(store: Store): NotificationPermissionStatusResult {
  return {
    supported: Notification.isSupported(),
    platform: process.platform,
    requested: store.getUI().notificationPermissionRequested === true
  }
}

function scheduleNotificationDeliveryProbe(): Promise<NotificationDeliveryProbeResult> {
  if (deliveryProbeInFlight) {
    return deliveryProbeInFlight
  }
  permissionDialogTriggeredThisSession = true
  const probe = new Notification({
    title: translateMain('notifications.deliveryProbe.title', 'Yiru notifications are on'),
    body: translateMain(
      'notifications.deliveryProbe.body',
      'Yiru will alert you when agents finish or terminals need attention.'
    ),
    silent: true
  })

  deliveryProbeInFlight = new Promise<NotificationDeliveryProbeResult>((resolve) => {
    let settled = false
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    const release = retainNotificationUntilRelease(probe, undefined, () => {
      probe.removeListener('show', onShow)
      probe.removeListener('failed', onFailed)
    })

    function releaseProbe(): void {
      probe.close()
      release()
    }
    function settle(state: 'delivered' | 'blocked'): void {
      if (settled) {
        return
      }
      settled = true
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      recordNotificationDeliveryOutcome(state === 'delivered' ? 'delivered' : 'failed')
      resolve({ state, authoritative: false })
    }
    function onShow(): void {
      settle('delivered')
      // Why: the visible probe doubles as confirmation, so leave its banner
      // on screen briefly instead of closing it immediately.
      const closeTimer = setTimeout(releaseProbe, NOTIFICATION_PROBE_BANNER_CLOSE_DELAY_MS)
      if (typeof closeTimer.unref === 'function') {
        closeTimer.unref()
      }
    }
    function onFailed(): void {
      settle('blocked')
      releaseProbe()
    }

    probe.once('show', onShow)
    probe.once('failed', onFailed)
    // Why: a missing callback is ambiguous and must not become cached failure evidence.
    timeoutTimer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ state: 'blocked', authoritative: false })
        releaseProbe()
      }
    }, NOTIFICATION_PROBE_RESULT_TIMEOUT_MS)
    if (typeof timeoutTimer.unref === 'function') {
      timeoutTimer.unref()
    }
    probe.show()
  }).finally(() => {
    deliveryProbeInFlight = null
  })
  return deliveryProbeInFlight
}

export async function probeNotificationDelivery(
  store: Store,
  options?: { force?: boolean }
): Promise<NotificationDeliveryProbeResult> {
  if (process.platform !== 'darwin' || !Notification.isSupported()) {
    return { state: 'unsupported', authoritative: false }
  }
  if (store.getUI().notificationPermissionRequested !== true) {
    store.updateUI({ notificationPermissionRequested: true })
  }
  const authorization = await readNotificationAuthorizationStatus()
  if (authorization === 'authorized') {
    recordNotificationDeliveryOutcome('delivered')
    return { state: 'delivered', authoritative: true }
  }
  if (authorization === 'denied') {
    recordNotificationDeliveryOutcome('failed')
    return { state: 'blocked', authoritative: true }
  }
  if (authorization === 'not-determined') {
    // Why: the permission dialog appears only after a notification request.
    if (!permissionDialogTriggeredThisSession) {
      void scheduleNotificationDeliveryProbe()
    }
    return { state: 'awaiting-decision', authoritative: true }
  }
  if (!options?.force && lastObservedDeliveryOutcome !== null) {
    return {
      state: lastObservedDeliveryOutcome === 'delivered' ? 'delivered' : 'blocked',
      authoritative: false
    }
  }
  return scheduleNotificationDeliveryProbe()
}
