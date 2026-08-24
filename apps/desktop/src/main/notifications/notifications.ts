import type { Store } from '../persistence'
import { displayNativeNotification } from './native-notification-display'
import { dismissNativeNotifications } from './native-notification-handles'
import {
  getNotificationPermissionStatus,
  openNotificationSystemSettings,
  probeNotificationDelivery,
  resetNotificationPermissionSession
} from './notification-permission'
import { loadNotificationSound } from './notification-sound'

export { triggerStartupNotificationRegistration } from './startup-registration'

type ShellNotificationsService = ReturnType<typeof createShellNotificationsService>

let shellNotificationsService: ShellNotificationsService | null = null

export function initializeShellNotificationsService(store: Store): void {
  shellNotificationsService = createShellNotificationsService(store)
}

export function getShellNotificationsService(): ShellNotificationsService {
  if (!shellNotificationsService) {
    throw new Error('shell_notifications_service_unavailable')
  }
  return shellNotificationsService
}

function createShellNotificationsService(store: Store) {
  // Why: service registration starts a fresh permission-observation session;
  // evidence from a previous host connection must not leak into it.
  resetNotificationPermissionSession()
  return {
    openSystemSettings: openNotificationSystemSettings,
    getPermissionStatus: () => getNotificationPermissionStatus(store),
    probeDelivery: (options?: { force?: boolean }) => probeNotificationDelivery(store, options),
    dismissNative: dismissNativeNotifications,
    displayNative: displayNativeNotification,
    loadSound: () => loadNotificationSound(store.getSettings().notifications)
  }
}
