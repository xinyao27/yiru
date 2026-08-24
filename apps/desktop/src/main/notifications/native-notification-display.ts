import type {
  ShellServicesNotificationsDisplayInput,
  ShellServicesNotificationsDisplayOutput
} from '@yiru/runtime-protocol/contract'
import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import { app, BrowserWindow, Notification } from 'electron'
import { parsePaneKey } from '~shared/stable-pane-id'

import { electronShellServicesConnectionId } from '../runtime/rpc/orpc/shell-services-identity'
import { dispatchShellUICommand } from '../runtime/rpc/orpc/shell-services-reverse-link'
import {
  logNativeNotificationFailure,
  retainNotificationUntilRelease,
  waitForNotificationDisplay
} from './native-notification-handles'
import { readNotificationAuthorizationStatus } from './notification-authorization-status'
import { recordNotificationDeliveryOutcome } from './notification-permission'

function focusNotificationTarget(args: ShellServicesNotificationsDisplayInput): void {
  const worktreeId = args.worktreeId
  if (!worktreeId || !worktreeId.includes('::')) {
    return
  }
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  if (!window) {
    return
  }
  if (process.platform === 'darwin') {
    app.focus({ steal: true })
  }
  if (window.isMinimized()) {
    window.restore()
  }
  window.focus()
  const connectionId = electronShellServicesConnectionId(window.webContents.id)
  dispatchShellUICommand(connectionId, {
    type: 'activateWorktree',
    repoId: getRepoIdFromWorktreeId(worktreeId),
    worktreeId
  })
  const paneTarget = args.paneKey ? parsePaneKey(args.paneKey) : null
  if (paneTarget) {
    dispatchShellUICommand(connectionId, {
      type: 'focusTerminal',
      tabId: paneTarget.tabId,
      worktreeId,
      leafId: paneTarget.leafId,
      ackPaneKeyOnSuccess: args.paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  }
}

function deliverNativeNotification(
  args: ShellServicesNotificationsDisplayInput
): ShellServicesNotificationsDisplayOutput | Promise<ShellServicesNotificationsDisplayOutput> {
  const options: { title: string; body: string; silent?: boolean; sound?: string } = {
    title: args.title,
    body: args.body
  }
  if (!args.useSystemSound) {
    options.silent = true
  } else if (process.platform === 'darwin') {
    // Why: macOS treats an unset sound as silent rather than as the default sound.
    options.sound = 'default'
  }
  const notification = new Notification(options)
  let clickHandler: (() => void) | null = null
  let failedHandler: ((_event: unknown, error?: string) => void) | null = null
  const release = retainNotificationUntilRelease(notification, args.notificationId, () => {
    if (clickHandler) {
      notification.removeListener('click', clickHandler)
      clickHandler = null
    }
    if (failedHandler) {
      notification.removeListener('failed', failedHandler)
      failedHandler = null
    }
  })

  failedHandler = (_event, error) => {
    logNativeNotificationFailure(args.source ?? 'notification', error)
    recordNotificationDeliveryOutcome('failed')
    release()
  }
  notification.on('failed', failedHandler)
  if (args.worktreeId?.includes('::')) {
    clickHandler = () => {
      release()
      focusNotificationTarget(args)
    }
    notification.on('click', clickHandler)
  }
  const displayConfirmation = args.requireDisplayConfirmation
    ? waitForNotificationDisplay(notification)
    : null
  notification.show()
  if (!displayConfirmation) {
    return { delivered: true }
  }
  return displayConfirmation.then((displayed) => {
    if (!displayed) {
      release()
      return { delivered: false, reason: 'not-displayed' }
    }
    recordNotificationDeliveryOutcome('delivered')
    return { delivered: true }
  })
}

export function displayNativeNotification(
  args: ShellServicesNotificationsDisplayInput
): ShellServicesNotificationsDisplayOutput | Promise<ShellServicesNotificationsDisplayOutput> {
  const browserWindow =
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
  if (args.suppressWhenFocused && browserWindow?.isFocused()) {
    return { delivered: false, reason: 'suppressed-focus' }
  }
  if (!Notification.isSupported()) {
    return { delivered: false, reason: 'not-supported' }
  }
  if (process.platform !== 'darwin') {
    return deliverNativeNotification(args)
  }
  // Why: macOS accepts and silently discards notifications while permission
  // is denied or undecided; report the block so the renderer can guide users.
  return readNotificationAuthorizationStatus().then((authorization) => {
    if (authorization === 'denied' || authorization === 'not-determined') {
      recordNotificationDeliveryOutcome('failed')
      return { delivered: false, reason: 'blocked-by-system' }
    }
    return deliverNativeNotification(args)
  })
}
