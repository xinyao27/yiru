import type {
  ShellServicesNotificationsDismissInput,
  ShellServicesNotificationsDismissResult,
  ShellServicesNotificationsDisplayInput,
  ShellServicesNotificationsDisplayResult
} from '@yiru/runtime-protocol/contract'

import type { ShellServicesConnectionId } from './shell-services-identity'
import { getConnectedShellServicesClient } from './shell-services-reverse-link'

export async function displayShellNotification(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesNotificationsDisplayInput
): Promise<ShellServicesNotificationsDisplayResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  try {
    const output = await client.notifications.display(input)
    return { ok: true, ...output }
  } catch {
    return { ok: false, reason: 'shell-unavailable' }
  }
}

export async function dismissShellNotifications(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesNotificationsDismissInput
): Promise<ShellServicesNotificationsDismissResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  try {
    const output = await client.notifications.dismiss(input)
    return { ok: true, ...output }
  } catch {
    return { ok: false, reason: 'shell-unavailable' }
  }
}
