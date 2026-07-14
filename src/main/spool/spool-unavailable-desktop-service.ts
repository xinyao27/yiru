import type {
  SpoolDecideControlArgs,
  SpoolRequestControlArgs,
  SpoolRequesterInvokeArgs,
  SpoolRequesterSubscriptionArgs,
  SpoolRevokeControlArgs,
  SpoolSetProjectVisibilityArgs,
  SpoolSetWorktreeVisibilityArgs,
  SpoolSharingSnapshot
} from '../../shared/spool/spool-ipc-contract'
import type {
  SpoolWindowsFirewallRepairResult,
  SpoolWindowsFirewallStatus
} from '../../shared/spool/spool-windows-firewall-contract'
import type { SpoolSharingIpcSubscriptionSink } from '../ipc/spool-requester-subscriptions'
import type { SpoolSharingIpcController } from '../ipc/spool-sharing'

const UNAVAILABLE_SNAPSHOT: SpoolSharingSnapshot = {
  status: 'unavailable',
  diagnostic: 'spool_unavailable',
  remoteDesktops: [],
  ownerWorktrees: [],
  ownerControlRequests: [],
  ownerControlGrants: [],
  requesterControlStates: []
}

/** Keeps the renderer contract present when Spool cannot safely compose. */
export class SpoolUnavailableDesktopService implements SpoolSharingIpcController {
  snapshot(): SpoolSharingSnapshot {
    return UNAVAILABLE_SNAPSHOT
  }

  subscribe(listener: (snapshot: SpoolSharingSnapshot) => void): () => void {
    listener(UNAVAILABLE_SNAPSHOT)
    return () => {}
  }

  setWorktreeVisibility(_args: SpoolSetWorktreeVisibilityArgs): Promise<void> {
    return unavailable()
  }

  setProjectVisibility(_args: SpoolSetProjectVisibilityArgs): Promise<void> {
    return unavailable()
  }

  requestControl(_args: SpoolRequestControlArgs): Promise<void> {
    return unavailable()
  }

  decideControl(_args: SpoolDecideControlArgs): Promise<void> {
    return unavailable()
  }

  revokeControl(_args: SpoolRevokeControlArgs): Promise<void> {
    return unavailable()
  }

  getWindowsFirewallStatus(): Promise<SpoolWindowsFirewallStatus> {
    return Promise.resolve({ supported: false })
  }

  repairWindowsFirewall(): Promise<SpoolWindowsFirewallRepairResult> {
    return Promise.resolve({ ok: false, reason: 'unsupported' })
  }

  retryAvailability(): Promise<void> {
    return unavailable()
  }

  invokeRequester(_args: SpoolRequesterInvokeArgs): Promise<unknown> {
    return unavailable()
  }

  subscribeRequester(
    _args: SpoolRequesterSubscriptionArgs,
    _sink: SpoolSharingIpcSubscriptionSink
  ): never {
    throw new Error('resource_unavailable')
  }
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error('resource_unavailable'))
}
