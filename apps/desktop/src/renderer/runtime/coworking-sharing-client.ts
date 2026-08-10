import type {
  CoworkingDecideHostAccessArgs,
  CoworkingDecideControlArgs,
  CoworkingListHostDevicesResult,
  CoworkingRequestHostAccessArgs,
  CoworkingRequestHostAccessResult,
  CoworkingRequestControlArgs,
  CoworkingRequesterInvokeArgs,
  CoworkingRequesterSubscriptionArgs,
  CoworkingRequesterSubscriptionEvent,
  CoworkingRevokeControlArgs,
  CoworkingRevokeHostDeviceArgs,
  CoworkingRevokeHostDeviceResult,
  CoworkingSetProjectVisibilityArgs,
  CoworkingSetWorktreeVisibilityArgs,
  CoworkingSharingSnapshot
} from '~shared/coworking/ipc-contract'
import type {
  CoworkingWindowsFirewallRepairResult,
  CoworkingWindowsFirewallStatus
} from '~shared/coworking/windows-firewall-contract'

import { callRuntimeOrpc, createRuntimeOrpcClient } from './orpc-client'

const LOCAL_RUNTIME_TARGET = { kind: 'local' } as const

export const coworkingSharingClient = {
  getSnapshot: (): Promise<CoworkingSharingSnapshot> =>
    callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.coworking.sharing.snapshot, undefined),
  setWorktreeVisibility: (args: CoworkingSetWorktreeVisibilityArgs): Promise<void> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.setWorktreeVisibility,
      { id: args.worktreeId, visibility: args.visibility }
    ),
  setProjectVisibility: (args: CoworkingSetProjectVisibilityArgs): Promise<void> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.setProjectVisibility,
      { id: args.projectId, visibility: args.visibility }
    ),
  requestControl: (args: CoworkingRequestControlArgs): Promise<void> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.requestControl,
      args
    ),
  decideControl: (args: CoworkingDecideControlArgs): Promise<void> =>
    callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.coworking.sharing.decideControl, args),
  revokeControl: (args: CoworkingRevokeControlArgs): Promise<void> =>
    callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.coworking.sharing.revokeControl, args),
  requestHostAccess: (
    args: CoworkingRequestHostAccessArgs
  ): Promise<CoworkingRequestHostAccessResult> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.requestHostAccess,
      args
    ),
  decideHostAccess: (args: CoworkingDecideHostAccessArgs): Promise<void> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.decideHostAccess,
      args
    ),
  listHostDevices: (): Promise<CoworkingListHostDevicesResult> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.listHostDevices,
      undefined
    ),
  revokeHostDevice: (
    args: CoworkingRevokeHostDeviceArgs
  ): Promise<CoworkingRevokeHostDeviceResult> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.revokeHostDevice,
      args
    ),
  getWindowsFirewallStatus: (): Promise<CoworkingWindowsFirewallStatus> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.getWindowsFirewallStatus,
      undefined
    ),
  repairWindowsFirewall: (): Promise<CoworkingWindowsFirewallRepairResult> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.repairWindowsFirewall,
      undefined
    ),
  retryAvailability: (): Promise<void> =>
    callRuntimeOrpc(
      LOCAL_RUNTIME_TARGET,
      (client) => client.coworking.sharing.retryAvailability,
      undefined
    ),
  invoke: (args: CoworkingRequesterInvokeArgs): Promise<unknown> =>
    callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.coworking.sharing.invoke, args)
}

export function subscribeCoworkingSharingSnapshots(
  onSnapshot: (snapshot: CoworkingSharingSnapshot) => void
): () => void {
  return consumeCoworkingSharingStream(
    async (connection, signal) =>
      connection.client.coworking.sharing.snapshots(undefined, { signal }),
    onSnapshot
  )
}

export function subscribeCoworkingRequester(
  args: CoworkingRequesterSubscriptionArgs,
  onEvent: (event: CoworkingRequesterSubscriptionEvent) => void,
  onError: (error: unknown) => void
): () => void {
  return consumeCoworkingSharingStream(
    async (connection, signal) =>
      connection.client.coworking.sharing.subscribeRequester(args, { signal }),
    onEvent,
    onError
  )
}

function consumeCoworkingSharingStream<T>(
  open: (
    connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>>,
    signal: AbortSignal
  ) => Promise<AsyncIterator<T>>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void = () => {}
): () => void {
  const controller = new AbortController()
  void (async () => {
    let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
    try {
      connection = await createRuntimeOrpcClient(LOCAL_RUNTIME_TARGET, {
        signal: controller.signal
      })
      const stream = await open(connection, controller.signal)
      for await (const value of { [Symbol.asyncIterator]: () => stream }) {
        if (controller.signal.aborted) {
          return
        }
        onValue(value)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        onError(error)
      }
    } finally {
      connection?.close()
    }
  })()
  return () => controller.abort()
}
