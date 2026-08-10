import type {
  CoworkingDecideHostAccessArgs,
  CoworkingDecideControlArgs,
  CoworkingListHostDevicesResult,
  CoworkingRequestHostAccessArgs,
  CoworkingRequestHostAccessResult,
  CoworkingRequestControlArgs,
  CoworkingRequesterInvokeArgs,
  CoworkingRequesterSubscriptionArgs,
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

import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import {
  CoworkingRequesterSubscriptions,
  type CoworkingSharingSubscription,
  type CoworkingSharingSubscriptionSink
} from './requester-subscriptions'

export type CoworkingSharingController = {
  snapshot(): CoworkingSharingSnapshot
  subscribe(listener: (snapshot: CoworkingSharingSnapshot) => void): () => void
  setWorktreeVisibility(args: CoworkingSetWorktreeVisibilityArgs): Promise<void>
  setProjectVisibility(args: CoworkingSetProjectVisibilityArgs): Promise<void>
  requestControl(args: CoworkingRequestControlArgs): Promise<void>
  decideControl(args: CoworkingDecideControlArgs): Promise<void>
  revokeControl(args: CoworkingRevokeControlArgs): Promise<void>
  requestHostAccess(args: CoworkingRequestHostAccessArgs): Promise<CoworkingRequestHostAccessResult>
  decideHostAccess(args: CoworkingDecideHostAccessArgs): Promise<void>
  listHostDevices(): Promise<CoworkingListHostDevicesResult>
  revokeHostDevice(args: CoworkingRevokeHostDeviceArgs): Promise<CoworkingRevokeHostDeviceResult>
  getWindowsFirewallStatus(): Promise<CoworkingWindowsFirewallStatus>
  repairWindowsFirewall(): Promise<CoworkingWindowsFirewallRepairResult>
  retryAvailability(): Promise<void>
  invokeRequester(args: CoworkingRequesterInvokeArgs): Promise<unknown>
  subscribeRequester(
    args: CoworkingRequesterSubscriptionArgs,
    sink: CoworkingSharingSubscriptionSink
  ): CoworkingSharingSubscription
}

export type CoworkingSharingBinding = {
  controller: CoworkingSharingController
  requesterSubscriptions: CoworkingRequesterSubscriptions
}

const bindings = new WeakMap<YiruRuntimeService, CoworkingSharingBinding>()

export function registerCoworkingSharingController(
  runtime: YiruRuntimeService,
  controller: CoworkingSharingController
): () => void {
  const previous = bindings.get(runtime)
  previous?.requesterSubscriptions.close()
  const binding = {
    controller,
    requesterSubscriptions: new CoworkingRequesterSubscriptions(controller)
  }
  bindings.set(runtime, binding)
  return () => {
    if (bindings.get(runtime) !== binding) {
      return
    }
    bindings.delete(runtime)
    binding.requesterSubscriptions.close()
  }
}

export function getCoworkingSharingBinding(runtime: YiruRuntimeService): CoworkingSharingBinding {
  const binding = bindings.get(runtime)
  if (!binding) {
    throw new Error('resource_unavailable')
  }
  return binding
}
