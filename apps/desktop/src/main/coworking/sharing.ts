import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  CoworkingDecideControlArgs,
  CoworkingRequestControlArgs,
  CoworkingRequesterInvokeArgs,
  CoworkingRequesterSubscriptionArgs,
  CoworkingRequesterSubscriptionStopArgs,
  CoworkingRevokeControlArgs,
  CoworkingSetProjectVisibilityArgs,
  CoworkingSetWorktreeVisibilityArgs,
  CoworkingSharingSnapshot
} from '~shared/coworking/ipc-contract'
import {
  isCoworkingRequesterInvokeMethod,
  isCoworkingRequesterSubscriptionMethod
} from '~shared/coworking/ipc-contract'
import type {
  CoworkingWindowsFirewallRepairResult,
  CoworkingWindowsFirewallStatus
} from '~shared/coworking/windows-firewall-contract'

import {
  CoworkingRequesterIpcSubscriptions,
  coworkingRequesterTransportError,
  type CoworkingSharingIpcSubscription,
  type CoworkingSharingIpcSubscriptionSink
} from './requester-subscriptions'

const COWORKING_SHARING_CHANGED_CHANNEL = 'coworkingSharing:changed'
const COWORKING_SUBSCRIPTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type CoworkingSharingIpcController = {
  snapshot(): CoworkingSharingSnapshot
  subscribe(listener: (snapshot: CoworkingSharingSnapshot) => void): () => void
  setWorktreeVisibility(args: CoworkingSetWorktreeVisibilityArgs): Promise<void>
  setProjectVisibility(args: CoworkingSetProjectVisibilityArgs): Promise<void>
  requestControl(args: CoworkingRequestControlArgs): Promise<void>
  decideControl(args: CoworkingDecideControlArgs): Promise<void>
  revokeControl(args: CoworkingRevokeControlArgs): Promise<void>
  getWindowsFirewallStatus(): Promise<CoworkingWindowsFirewallStatus>
  repairWindowsFirewall(): Promise<CoworkingWindowsFirewallRepairResult>
  retryAvailability(): Promise<void>
  invokeRequester(args: CoworkingRequesterInvokeArgs): Promise<unknown>
  subscribeRequester(
    args: CoworkingRequesterSubscriptionArgs,
    sink: CoworkingSharingIpcSubscriptionSink
  ): CoworkingSharingIpcSubscription
}

export function registerCoworkingSharingHandlers(
  controller: CoworkingSharingIpcController
): () => void {
  const requesterSubscriptions = new CoworkingRequesterIpcSubscriptions(controller)

  ipcMain.handle('coworkingSharing:getSnapshot', (event) => {
    requireWindowRenderer(event)
    return controller.snapshot()
  })
  ipcMain.handle('coworkingSharing:setWorktreeVisibility', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.setWorktreeVisibility(readVisibilityArgs(value, 'worktreeId'))
  })
  ipcMain.handle('coworkingSharing:setProjectVisibility', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.setProjectVisibility(readVisibilityArgs(value, 'projectId'))
  })
  ipcMain.handle('coworkingSharing:requestControl', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.requestControl(readRequestControlArgs(value))
  })
  ipcMain.handle('coworkingSharing:decideControl', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.decideControl(readDecisionArgs(value))
  })
  ipcMain.handle('coworkingSharing:revokeControl', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.revokeControl({ grantId: readIdentifier(value, 'grantId') })
  })
  ipcMain.handle('coworkingSharing:getWindowsFirewallStatus', (event, ...values: unknown[]) => {
    requireWindowRenderer(event)
    requireNoArguments(values)
    return controller.getWindowsFirewallStatus()
  })
  ipcMain.handle('coworkingSharing:repairWindowsFirewall', (event, ...values: unknown[]) => {
    requireWindowRenderer(event)
    requireNoArguments(values)
    return controller.repairWindowsFirewall()
  })
  ipcMain.handle('coworkingSharing:retryAvailability', (event, ...values: unknown[]) => {
    requireWindowRenderer(event)
    requireNoArguments(values)
    return controller.retryAvailability()
  })
  ipcMain.handle('coworkingSharing:invoke', async (event, value: unknown): Promise<unknown> => {
    requireWindowRenderer(event)
    try {
      return await controller.invokeRequester(readRequesterInvokeArgs(value))
    } catch (error) {
      throw coworkingRequesterTransportError(error)
    }
  })
  ipcMain.handle('coworkingSharing:startSubscription', (event, value: unknown) => {
    requireWindowRenderer(event)
    try {
      return requesterSubscriptions.start(event.sender, readRequesterSubscriptionArgs(value))
    } catch (error) {
      throw coworkingRequesterTransportError(error)
    }
  })
  ipcMain.handle('coworkingSharing:stopSubscription', (event, value: unknown) => {
    requireWindowRenderer(event)
    const args = readRequesterSubscriptionStopArgs(value)
    return requesterSubscriptions.stop(event.sender.id, args.subscriptionId)
  })
  const unsubscribe = controller.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(COWORKING_SHARING_CHANGED_CHANNEL, snapshot)
      }
    }
  })
  return () => {
    unsubscribe()
    requesterSubscriptions.close()
    for (const channel of COWORKING_HANDLER_CHANNELS) {
      ipcMain.removeHandler(channel)
    }
  }
}

function requireWindowRenderer(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed() || event.sender.getType() !== 'window') {
    throw new Error('unauthorized')
  }
}

const COWORKING_HANDLER_CHANNELS = [
  'coworkingSharing:getSnapshot',
  'coworkingSharing:setWorktreeVisibility',
  'coworkingSharing:setProjectVisibility',
  'coworkingSharing:requestControl',
  'coworkingSharing:decideControl',
  'coworkingSharing:revokeControl',
  'coworkingSharing:getWindowsFirewallStatus',
  'coworkingSharing:repairWindowsFirewall',
  'coworkingSharing:retryAvailability',
  'coworkingSharing:invoke',
  'coworkingSharing:startSubscription',
  'coworkingSharing:stopSubscription'
] as const

function requireNoArguments(values: readonly unknown[]): void {
  if (values.length !== 0) {
    throw new Error('invalid_coworking_arguments')
  }
}

function readVisibilityArgs(
  value: unknown,
  key: 'worktreeId' | 'projectId'
): CoworkingSetWorktreeVisibilityArgs & CoworkingSetProjectVisibilityArgs {
  const record = asRecord(value)
  const visibility = record.visibility
  if (visibility !== 'public' && visibility !== 'private') {
    throw new Error('invalid_coworking_visibility')
  }
  const identifier = readIdentifier(value, key)
  return { worktreeId: identifier, projectId: identifier, visibility }
}

function readRequestControlArgs(value: unknown): CoworkingRequestControlArgs {
  return {
    desktopRef: readIdentifier(value, 'desktopRef'),
    worktreeRef: readIdentifier(value, 'worktreeRef')
  }
}

function readDecisionArgs(value: unknown): CoworkingDecideControlArgs {
  const record = asRecord(value)
  if (record.decision !== 'allow' && record.decision !== 'deny') {
    throw new Error('invalid_coworking_decision')
  }
  return { requestId: readIdentifier(value, 'requestId'), decision: record.decision }
}

function readRequesterInvokeArgs(value: unknown): CoworkingRequesterInvokeArgs {
  const record = asRecord(value)
  const method = readMethod(record)
  if (!isCoworkingRequesterInvokeMethod(method)) {
    throw new Error('method_not_found')
  }
  return {
    desktopRef: readIdentifier(value, 'desktopRef'),
    connectionEpoch: readConnectionEpoch(record.connectionEpoch),
    method,
    params: readOpaqueParams(record.params)
  }
}

function readRequesterSubscriptionArgs(value: unknown): CoworkingRequesterSubscriptionArgs {
  const record = asRecord(value)
  requireExactKeys(record, ['subscriptionId', 'desktopRef', 'connectionEpoch', 'method', 'params'])
  const method = readMethod(record)
  if (!isCoworkingRequesterSubscriptionMethod(method)) {
    throw new Error('method_not_found')
  }
  return {
    subscriptionId: readSubscriptionId(record.subscriptionId),
    desktopRef: readIdentifier(value, 'desktopRef'),
    connectionEpoch: readConnectionEpoch(record.connectionEpoch),
    method,
    params: readOpaqueParams(record.params)
  }
}

function readRequesterSubscriptionStopArgs(value: unknown): CoworkingRequesterSubscriptionStopArgs {
  const record = asRecord(value)
  requireExactKeys(record, ['subscriptionId'])
  return { subscriptionId: readSubscriptionId(record.subscriptionId) }
}

function readSubscriptionId(value: unknown): string {
  if (typeof value !== 'string' || !COWORKING_SUBSCRIPTION_ID_PATTERN.test(value)) {
    throw new Error('invalid_coworking_subscription_id')
  }
  return value
}

function requireExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): void {
  const keys = Object.keys(record)
  const expected = new Set(expectedKeys)
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new Error('invalid_coworking_arguments')
  }
}

function readMethod(record: Record<string, unknown>): string {
  const method = record.method
  if (typeof method !== 'string' || method.length === 0 || method.length > 128) {
    throw new Error('invalid_argument')
  }
  return method
}

function readConnectionEpoch(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('invalid_argument')
  }
  return Number(value)
}

function readOpaqueParams(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_argument')
  }
  return value
}

function readIdentifier(value: unknown, key: string): string {
  const identifier = asRecord(value)[key]
  if (typeof identifier !== 'string' || identifier.length === 0 || identifier.length > 2048) {
    throw new Error('invalid_coworking_identifier')
  }
  return identifier
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_coworking_arguments')
  }
  return value as Record<string, unknown>
}
