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

import type { CoworkingHostDeviceRegistry } from './owner/service-options'
import type { CoworkingSharingSubscriptionSink } from './requester-subscriptions'
import type { CoworkingSharingController } from './sharing'

const UNAVAILABLE_SNAPSHOT: CoworkingSharingSnapshot = {
  status: 'unavailable',
  diagnostic: 'coworking_unavailable',
  self: null,
  remoteDesktops: [],
  ownerWorktrees: [],
  ownerControlRequests: [],
  ownerHostAccessRequests: [],
  ownerControlGrants: [],
  ownerActiveConnections: [],
  requesterControlStates: []
}

export class CoworkingUnavailableOwnerService implements CoworkingSharingController {
  private readonly hostDevices?: CoworkingHostDeviceRegistry

  constructor(hostDevices?: CoworkingHostDeviceRegistry) {
    this.hostDevices = hostDevices
  }

  snapshot(): CoworkingSharingSnapshot {
    return UNAVAILABLE_SNAPSHOT
  }

  subscribe(listener: (snapshot: CoworkingSharingSnapshot) => void): () => void {
    listener(UNAVAILABLE_SNAPSHOT)
    return () => {}
  }

  setWorktreeVisibility(_args: CoworkingSetWorktreeVisibilityArgs): Promise<void> {
    return unavailable()
  }

  setProjectVisibility(_args: CoworkingSetProjectVisibilityArgs): Promise<void> {
    return unavailable()
  }

  requestControl(_args: CoworkingRequestControlArgs): Promise<void> {
    return unavailable()
  }

  decideControl(_args: CoworkingDecideControlArgs): Promise<void> {
    return unavailable()
  }

  revokeControl(_args: CoworkingRevokeControlArgs): Promise<void> {
    return unavailable()
  }

  requestHostAccess(
    _args: CoworkingRequestHostAccessArgs
  ): Promise<CoworkingRequestHostAccessResult> {
    return unavailable()
  }

  decideHostAccess(_args: CoworkingDecideHostAccessArgs): Promise<void> {
    return unavailable()
  }

  listHostDevices(): Promise<CoworkingListHostDevicesResult> {
    return this.hostDevices
      ? Promise.resolve({ devices: this.hostDevices.listCoworkingHostDevices() })
      : unavailable()
  }

  revokeHostDevice(args: CoworkingRevokeHostDeviceArgs): Promise<CoworkingRevokeHostDeviceResult> {
    return this.hostDevices
      ? Promise.resolve({ revoked: this.hostDevices.revokeCoworkingHostDevice(args.deviceId) })
      : unavailable()
  }

  getWindowsFirewallStatus(): Promise<CoworkingWindowsFirewallStatus> {
    return Promise.resolve({ supported: false })
  }

  repairWindowsFirewall(): Promise<CoworkingWindowsFirewallRepairResult> {
    return Promise.resolve({ ok: false, reason: 'unsupported' })
  }

  retryAvailability(): Promise<void> {
    return unavailable()
  }

  invokeRequester(_args: CoworkingRequesterInvokeArgs): Promise<unknown> {
    return unavailable()
  }

  subscribeRequester(
    _args: CoworkingRequesterSubscriptionArgs,
    _sink: CoworkingSharingSubscriptionSink
  ): never {
    throw new Error('resource_unavailable')
  }
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error('resource_unavailable'))
}
