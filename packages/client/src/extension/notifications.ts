import type { ShellNotificationsApi } from '../runtime/shell-notifications-client'
import { electronShellNotificationsApi } from '../runtime/shell-notifications-client'
import { getExtensionBrowserCapabilities } from './browser-capabilities'

export const extensionShellNotificationsApi: ShellNotificationsApi = {
  displayNative: (input) => getExtensionBrowserCapabilities().displayWorkbenchNotification(input),
  dismissNative: (notificationIds) =>
    getExtensionBrowserCapabilities().dismissWorkbenchNotifications(notificationIds),
  openSystemSettings: () => getExtensionBrowserCapabilities().openNotificationSettings(),
  getPermissionStatus: () => getExtensionBrowserCapabilities().getNotificationPermissionStatus(),
  probeDelivery: (options) => getExtensionBrowserCapabilities().probeNotificationDelivery(options),
  // Why: custom sounds can reference absolute daemon-host paths, so bytes still cross the
  // authenticated shell transport and playback remains in the browser renderer.
  playSound: electronShellNotificationsApi.playSound
}
