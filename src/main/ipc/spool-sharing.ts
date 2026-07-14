import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  SpoolDecideControlArgs,
  SpoolRequestControlArgs,
  SpoolRequesterInvokeArgs,
  SpoolRequesterSubscriptionArgs,
  SpoolRequesterSubscriptionStopArgs,
  SpoolRevokeControlArgs,
  SpoolSetProjectVisibilityArgs,
  SpoolSetWorktreeVisibilityArgs,
  SpoolSharingSnapshot
} from '../../shared/spool/spool-ipc-contract'
import type {
  SpoolWindowsFirewallRepairResult,
  SpoolWindowsFirewallStatus
} from '../../shared/spool/spool-windows-firewall-contract'
import {
  isSpoolRequesterInvokeMethod,
  isSpoolRequesterSubscriptionMethod
} from '../../shared/spool/spool-ipc-contract'
import {
  SpoolRequesterIpcSubscriptions,
  spoolRequesterTransportError,
  type SpoolSharingIpcSubscription,
  type SpoolSharingIpcSubscriptionSink
} from './spool-requester-subscriptions'

const SPOOL_SHARING_CHANGED_CHANNEL = 'spoolSharing:changed'
const SPOOL_SUBSCRIPTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type SpoolSharingIpcController = {
  snapshot(): SpoolSharingSnapshot
  subscribe(listener: (snapshot: SpoolSharingSnapshot) => void): () => void
  setWorktreeVisibility(args: SpoolSetWorktreeVisibilityArgs): Promise<void>
  setProjectVisibility(args: SpoolSetProjectVisibilityArgs): Promise<void>
  requestControl(args: SpoolRequestControlArgs): Promise<void>
  decideControl(args: SpoolDecideControlArgs): Promise<void>
  revokeControl(args: SpoolRevokeControlArgs): Promise<void>
  getWindowsFirewallStatus(): Promise<SpoolWindowsFirewallStatus>
  repairWindowsFirewall(): Promise<SpoolWindowsFirewallRepairResult>
  retryAvailability(): Promise<void>
  invokeRequester(args: SpoolRequesterInvokeArgs): Promise<unknown>
  subscribeRequester(
    args: SpoolRequesterSubscriptionArgs,
    sink: SpoolSharingIpcSubscriptionSink
  ): SpoolSharingIpcSubscription
}

export function registerSpoolSharingHandlers(controller: SpoolSharingIpcController): () => void {
  const requesterSubscriptions = new SpoolRequesterIpcSubscriptions(controller)

  ipcMain.handle('spoolSharing:getSnapshot', (event) => {
    requireWindowRenderer(event)
    return controller.snapshot()
  })
  ipcMain.handle('spoolSharing:setWorktreeVisibility', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.setWorktreeVisibility(readVisibilityArgs(value, 'worktreeId'))
  })
  ipcMain.handle('spoolSharing:setProjectVisibility', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.setProjectVisibility(readVisibilityArgs(value, 'projectId'))
  })
  ipcMain.handle('spoolSharing:requestControl', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.requestControl(readRequestControlArgs(value))
  })
  ipcMain.handle('spoolSharing:decideControl', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.decideControl(readDecisionArgs(value))
  })
  ipcMain.handle('spoolSharing:revokeControl', (event, value: unknown) => {
    requireWindowRenderer(event)
    return controller.revokeControl({ grantId: readIdentifier(value, 'grantId') })
  })
  ipcMain.handle('spoolSharing:getWindowsFirewallStatus', (event, ...values: unknown[]) => {
    requireWindowRenderer(event)
    requireNoArguments(values)
    return controller.getWindowsFirewallStatus()
  })
  ipcMain.handle('spoolSharing:repairWindowsFirewall', (event, ...values: unknown[]) => {
    requireWindowRenderer(event)
    requireNoArguments(values)
    return controller.repairWindowsFirewall()
  })
  ipcMain.handle('spoolSharing:retryAvailability', (event, ...values: unknown[]) => {
    requireWindowRenderer(event)
    requireNoArguments(values)
    return controller.retryAvailability()
  })
  ipcMain.handle('spoolSharing:invoke', async (event, value: unknown): Promise<unknown> => {
    requireWindowRenderer(event)
    try {
      return await controller.invokeRequester(readRequesterInvokeArgs(value))
    } catch (error) {
      throw spoolRequesterTransportError(error)
    }
  })
  ipcMain.handle('spoolSharing:startSubscription', (event, value: unknown) => {
    requireWindowRenderer(event)
    try {
      return requesterSubscriptions.start(event.sender, readRequesterSubscriptionArgs(value))
    } catch (error) {
      throw spoolRequesterTransportError(error)
    }
  })
  ipcMain.handle('spoolSharing:stopSubscription', (event, value: unknown) => {
    requireWindowRenderer(event)
    const args = readRequesterSubscriptionStopArgs(value)
    return requesterSubscriptions.stop(event.sender.id, args.subscriptionId)
  })
  const unsubscribe = controller.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(SPOOL_SHARING_CHANGED_CHANNEL, snapshot)
      }
    }
  })
  return () => {
    unsubscribe()
    requesterSubscriptions.close()
    for (const channel of SPOOL_HANDLER_CHANNELS) {
      ipcMain.removeHandler(channel)
    }
  }
}

function requireWindowRenderer(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed() || event.sender.getType() !== 'window') {
    throw new Error('unauthorized')
  }
}

const SPOOL_HANDLER_CHANNELS = [
  'spoolSharing:getSnapshot',
  'spoolSharing:setWorktreeVisibility',
  'spoolSharing:setProjectVisibility',
  'spoolSharing:requestControl',
  'spoolSharing:decideControl',
  'spoolSharing:revokeControl',
  'spoolSharing:getWindowsFirewallStatus',
  'spoolSharing:repairWindowsFirewall',
  'spoolSharing:retryAvailability',
  'spoolSharing:invoke',
  'spoolSharing:startSubscription',
  'spoolSharing:stopSubscription'
] as const

function requireNoArguments(values: readonly unknown[]): void {
  if (values.length !== 0) {
    throw new Error('invalid_spool_arguments')
  }
}

function readVisibilityArgs(
  value: unknown,
  key: 'worktreeId' | 'projectId'
): SpoolSetWorktreeVisibilityArgs & SpoolSetProjectVisibilityArgs {
  const record = asRecord(value)
  const visibility = record.visibility
  if (visibility !== 'public' && visibility !== 'private') {
    throw new Error('invalid_spool_visibility')
  }
  const identifier = readIdentifier(value, key)
  return { worktreeId: identifier, projectId: identifier, visibility }
}

function readRequestControlArgs(value: unknown): SpoolRequestControlArgs {
  return {
    desktopRef: readIdentifier(value, 'desktopRef'),
    worktreeRef: readIdentifier(value, 'worktreeRef')
  }
}

function readDecisionArgs(value: unknown): SpoolDecideControlArgs {
  const record = asRecord(value)
  if (record.decision !== 'allow' && record.decision !== 'deny') {
    throw new Error('invalid_spool_decision')
  }
  return { requestId: readIdentifier(value, 'requestId'), decision: record.decision }
}

function readRequesterInvokeArgs(value: unknown): SpoolRequesterInvokeArgs {
  const record = asRecord(value)
  const method = readMethod(record)
  if (!isSpoolRequesterInvokeMethod(method)) {
    throw new Error('method_not_found')
  }
  return {
    desktopRef: readIdentifier(value, 'desktopRef'),
    connectionEpoch: readConnectionEpoch(record.connectionEpoch),
    method,
    params: readOpaqueParams(record.params)
  }
}

function readRequesterSubscriptionArgs(value: unknown): SpoolRequesterSubscriptionArgs {
  const record = asRecord(value)
  requireExactKeys(record, ['subscriptionId', 'desktopRef', 'connectionEpoch', 'method', 'params'])
  const method = readMethod(record)
  if (!isSpoolRequesterSubscriptionMethod(method)) {
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

function readRequesterSubscriptionStopArgs(value: unknown): SpoolRequesterSubscriptionStopArgs {
  const record = asRecord(value)
  requireExactKeys(record, ['subscriptionId'])
  return { subscriptionId: readSubscriptionId(record.subscriptionId) }
}

function readSubscriptionId(value: unknown): string {
  if (typeof value !== 'string' || !SPOOL_SUBSCRIPTION_ID_PATTERN.test(value)) {
    throw new Error('invalid_spool_subscription_id')
  }
  return value
}

function requireExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): void {
  const keys = Object.keys(record)
  const expected = new Set(expectedKeys)
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new Error('invalid_spool_arguments')
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
    throw new Error('invalid_spool_identifier')
  }
  return identifier
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_spool_arguments')
  }
  return value as Record<string, unknown>
}
