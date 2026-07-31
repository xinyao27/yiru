import type {
  CoworkingDecideControlArgs,
  CoworkingRequestControlArgs,
  CoworkingRequesterInvokeArgs,
  CoworkingRequesterSubscriptionArgs,
  CoworkingRevokeControlArgs,
  CoworkingSetProjectVisibilityArgs,
  CoworkingSetWorktreeVisibilityArgs,
  CoworkingSharingSnapshot
} from '~shared/coworking/ipc-contract'
import type {
  CoworkingWindowsFirewallRepairResult,
  CoworkingWindowsFirewallStatus
} from '~shared/coworking/windows-firewall-contract'

import type { CoworkingSharingIpcSubscriptionSink } from './requester-subscriptions'
import type { CoworkingSharingIpcController } from './sharing'

const UNAVAILABLE_SNAPSHOT: CoworkingSharingSnapshot = {
  status: 'unavailable',
  diagnostic: 'coworking_unavailable',
  remoteDesktops: [],
  ownerWorktrees: [],
  ownerControlRequests: [],
  ownerControlGrants: [],
  requesterControlStates: []
}

/** Keeps the renderer contract present when Coworking cannot safely compose. */
export class CoworkingUnavailableOwnerService implements CoworkingSharingIpcController {
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
    _sink: CoworkingSharingIpcSubscriptionSink
  ): never {
    throw new Error('resource_unavailable')
  }
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error('resource_unavailable'))
}
