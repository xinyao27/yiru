import {
  handleCoworkingHostCanonicalizePath,
  handleCoworkingHostInspectWorktree,
  handleCoworkingHostInvoke,
  handleCoworkingHostListWorktrees,
  handleCoworkingHostReleaseChannel,
  handleCoworkingHostRevokeWorktree,
  handleCoworkingHostSubscribeTerminal
} from '~main/runtime/rpc/methods/coworking-host'
import {
  handleCoworkingHostInvokeSession,
  handleCoworkingHostListHistoricalSessionPage,
  handleCoworkingHostListLiveSessions,
  handleCoworkingHostReleaseHistoricalSessionPage,
  handleCoworkingHostUnsubscribeSessionChanges
} from '~main/runtime/rpc/methods/coworking-host-session-handlers'
import { handleCoworkingHostSubscribeSessionChanges } from '~main/runtime/rpc/methods/coworking-host-session-methods'
import {
  handleCoworkingDecideControl,
  handleCoworkingDecideHostAccess,
  handleCoworkingGetWindowsFirewallStatus,
  handleCoworkingListHostDevices,
  handleCoworkingRepairWindowsFirewall,
  handleCoworkingRequesterInvoke,
  handleCoworkingRequesterSubscribe,
  handleCoworkingRequestControl,
  handleCoworkingRequestHostAccess,
  handleCoworkingRetryAvailability,
  handleCoworkingRevokeControl,
  handleCoworkingRevokeHostDevice,
  handleCoworkingSetProjectVisibility,
  handleCoworkingSetWorktreeVisibility,
  handleCoworkingSharingSnapshot,
  handleCoworkingSharingSnapshots
} from '~main/runtime/rpc/methods/coworking-sharing'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: the owner's own backend reaching into a *remote* Yiru host's coworking
// session, keyed by `environmentId` — a main-process-to-main-process channel,
// never a renderer path (docs/runtime-orpc-migration.md Phase 6 D-stage,
// methods/index.ts's own `coworking` note). Slice 79 gave its unary callers
// (`main/coworking/paired-runtime/*`) a negotiated oRPC path gated on passing
// a real `RuntimeMethodContract`, which is what makes most of these 13 leaves
// retirable from the legacy registry at all. `subscribeTerminal`/
// `subscribeSessionChanges`/`unsubscribeSessionChanges` are wired here too — a
// directly-wired domain must supply every procedure under its top-level
// contract key or the omitted ones vanish from the router entirely (see
// router-direct.ts's own note and agent-session.ts's session.tabs
// precedent). All three leaves' only real callers reach them through a
// bare-method-name shared-control channel with no oRPC negotiation, so this
// direct wiring never served live traffic for them until slice 110 gave
// `RpcDispatcher` a fallback into it for unary bare-envelope callers —
// `unsubscribeSessionChanges` dropped its legacy registration that way.
// `subscribeTerminal`/`subscribeSessionChanges` are streaming (out of slice
// 110's scope) and needed slice 112's streaming sibling of that fallback
// (legacy-dispatch-fallback.ts's `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`)
// before they could drop theirs too — `coworking` is now fully retired
// (methods/coworking-host.ts, methods/coworking-host-session-methods.ts), no
// legacy registration left anywhere in the domain.
export const coworkingHostRuntimeHandlers = {
  coworking: {
    host: {
      listWorktrees: runtimeImplementation.coworking.host.listWorktrees.handler(
        wireRuntimeMethod('coworking.host.listWorktrees', handleCoworkingHostListWorktrees)
      ),
      inspectWorktree: runtimeImplementation.coworking.host.inspectWorktree.handler(
        wireRuntimeMethod('coworking.host.inspectWorktree', handleCoworkingHostInspectWorktree)
      ),
      canonicalizePath: runtimeImplementation.coworking.host.canonicalizePath.handler(
        wireRuntimeMethod('coworking.host.canonicalizePath', handleCoworkingHostCanonicalizePath)
      ),
      invoke: runtimeImplementation.coworking.host.invoke.handler(
        wireRuntimeMethod('coworking.host.invoke', handleCoworkingHostInvoke)
      ),
      subscribeTerminal: runtimeImplementation.coworking.host.subscribeTerminal.handler(
        wireRuntimeStream('coworking.host.subscribeTerminal', handleCoworkingHostSubscribeTerminal)
      ),
      releaseChannel: runtimeImplementation.coworking.host.releaseChannel.handler(
        wireRuntimeMethod('coworking.host.releaseChannel', handleCoworkingHostReleaseChannel)
      ),
      revokeWorktree: runtimeImplementation.coworking.host.revokeWorktree.handler(
        wireRuntimeMethod('coworking.host.revokeWorktree', handleCoworkingHostRevokeWorktree)
      ),
      listLiveSessions: runtimeImplementation.coworking.host.listLiveSessions.handler(
        wireRuntimeMethod('coworking.host.listLiveSessions', handleCoworkingHostListLiveSessions)
      ),
      listHistoricalSessionPage:
        runtimeImplementation.coworking.host.listHistoricalSessionPage.handler(
          wireRuntimeMethod(
            'coworking.host.listHistoricalSessionPage',
            handleCoworkingHostListHistoricalSessionPage
          )
        ),
      releaseHistoricalSessionPage:
        runtimeImplementation.coworking.host.releaseHistoricalSessionPage.handler(
          wireRuntimeMethod(
            'coworking.host.releaseHistoricalSessionPage',
            handleCoworkingHostReleaseHistoricalSessionPage
          )
        ),
      subscribeSessionChanges: runtimeImplementation.coworking.host.subscribeSessionChanges.handler(
        wireRuntimeStream(
          'coworking.host.subscribeSessionChanges',
          handleCoworkingHostSubscribeSessionChanges
        )
      ),
      unsubscribeSessionChanges:
        runtimeImplementation.coworking.host.unsubscribeSessionChanges.handler(
          wireRuntimeMethod(
            'coworking.host.unsubscribeSessionChanges',
            handleCoworkingHostUnsubscribeSessionChanges
          )
        ),
      invokeSession: runtimeImplementation.coworking.host.invokeSession.handler(
        wireRuntimeMethod('coworking.host.invokeSession', handleCoworkingHostInvokeSession)
      )
    },
    sharing: {
      snapshot: runtimeImplementation.coworking.sharing.snapshot.handler(
        wireRuntimeMethod('coworking.sharing.snapshot', handleCoworkingSharingSnapshot)
      ),
      snapshots: runtimeImplementation.coworking.sharing.snapshots.handler(
        wireRuntimeStream('coworking.sharing.snapshots', handleCoworkingSharingSnapshots)
      ),
      setWorktreeVisibility: runtimeImplementation.coworking.sharing.setWorktreeVisibility.handler(
        wireRuntimeMethod(
          'coworking.sharing.setWorktreeVisibility',
          handleCoworkingSetWorktreeVisibility
        )
      ),
      setProjectVisibility: runtimeImplementation.coworking.sharing.setProjectVisibility.handler(
        wireRuntimeMethod(
          'coworking.sharing.setProjectVisibility',
          handleCoworkingSetProjectVisibility
        )
      ),
      requestControl: runtimeImplementation.coworking.sharing.requestControl.handler(
        wireRuntimeMethod('coworking.sharing.requestControl', handleCoworkingRequestControl)
      ),
      decideControl: runtimeImplementation.coworking.sharing.decideControl.handler(
        wireRuntimeMethod('coworking.sharing.decideControl', handleCoworkingDecideControl)
      ),
      revokeControl: runtimeImplementation.coworking.sharing.revokeControl.handler(
        wireRuntimeMethod('coworking.sharing.revokeControl', handleCoworkingRevokeControl)
      ),
      requestHostAccess: runtimeImplementation.coworking.sharing.requestHostAccess.handler(
        wireRuntimeMethod('coworking.sharing.requestHostAccess', handleCoworkingRequestHostAccess)
      ),
      decideHostAccess: runtimeImplementation.coworking.sharing.decideHostAccess.handler(
        wireRuntimeMethod('coworking.sharing.decideHostAccess', handleCoworkingDecideHostAccess)
      ),
      listHostDevices: runtimeImplementation.coworking.sharing.listHostDevices.handler(
        wireRuntimeMethod('coworking.sharing.listHostDevices', handleCoworkingListHostDevices)
      ),
      revokeHostDevice: runtimeImplementation.coworking.sharing.revokeHostDevice.handler(
        wireRuntimeMethod('coworking.sharing.revokeHostDevice', handleCoworkingRevokeHostDevice)
      ),
      getWindowsFirewallStatus:
        runtimeImplementation.coworking.sharing.getWindowsFirewallStatus.handler(
          wireRuntimeMethod(
            'coworking.sharing.getWindowsFirewallStatus',
            handleCoworkingGetWindowsFirewallStatus
          )
        ),
      repairWindowsFirewall: runtimeImplementation.coworking.sharing.repairWindowsFirewall.handler(
        wireRuntimeMethod(
          'coworking.sharing.repairWindowsFirewall',
          handleCoworkingRepairWindowsFirewall
        )
      ),
      retryAvailability: runtimeImplementation.coworking.sharing.retryAvailability.handler(
        wireRuntimeMethod('coworking.sharing.retryAvailability', handleCoworkingRetryAvailability)
      ),
      invoke: runtimeImplementation.coworking.sharing.invoke.handler(
        wireRuntimeMethod('coworking.sharing.invoke', handleCoworkingRequesterInvoke)
      ),
      subscribeRequester: runtimeImplementation.coworking.sharing.subscribeRequester.handler(
        wireRuntimeStream('coworking.sharing.subscribeRequester', handleCoworkingRequesterSubscribe)
      )
    }
  }
} as const
