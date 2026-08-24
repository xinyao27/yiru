import {
  handleAgentStatusDrop,
  handleAgentStatusDropByTabPrefix,
  handleAgentStatusGetMigrationUnsupportedSnapshot,
  handleAgentStatusGetSnapshot,
  handleAgentStatusInferInterrupt,
  handleAgentStatusRetirePaneAuthority,
  handleAgentStatusTransferPaneAuthority
} from '~main/runtime/rpc/methods/agent-status'
import { handleAgentStatusEventsSubscribe } from '~main/runtime/rpc/methods/agent-status-events'
import {
  handleAgentTeamsPrepareLaunch,
  handleAgentTeamsTmuxCompat
} from '~main/runtime/rpc/methods/agent-teams-methods'
import { handleMobileDevelopmentPairing } from '~main/runtime/rpc/methods/mobile-development-pairing'
import {
  handleMobileHostPairingGetPairingQR,
  handleMobileHostPairingIsWebSocketReady,
  handleMobileHostPairingListDevices,
  handleMobileHostPairingListNetworkInterfaces,
  handleMobileHostPairingRevokeDevice
} from '~main/runtime/rpc/methods/mobile-host-pairing'
import {
  dismissRuntimeNotifications,
  getMissedRuntimeNotifications,
  handleNotificationsSubscribe,
  reportRuntimeNotification,
  unsubscribeRuntimeNotifications
} from '~main/runtime/rpc/methods/notifications'
import {
  handleSessionTabsActivate,
  handleSessionTabsClose,
  handleSessionTabsCreateTerminal,
  handleSessionTabsList,
  handleSessionTabsListAll,
  handleSessionTabsMove,
  handleSessionTabsSetTabProps,
  handleSessionTabsSubscribe,
  handleSessionTabsSubscribeAll,
  handleSessionTabsUnsubscribe,
  handleSessionTabsUnsubscribeAll,
  handleSessionTabsUpdatePaneLayout
} from '~main/runtime/rpc/methods/session-tabs-handlers'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: agentStatus, agentTeams, notifications, mobile pairing,
// and session (the live terminal/browser/editor tabs of a worktree) are all
// runtime-session-lifecycle surfaces — they track or notify about a live
// agent/tab/device rather than configuring the workspace or a provider.
export const agentSessionRuntimeHandlers = {
  agentTeams: {
    tmuxCompat: runtimeImplementation.agentTeams.tmuxCompat.handler(
      wireRuntimeMethod('agentTeams.tmuxCompat', handleAgentTeamsTmuxCompat)
    ),
    prepareLaunch: runtimeImplementation.agentTeams.prepareLaunch.handler(
      wireRuntimeMethod('agentTeams.prepareLaunch', handleAgentTeamsPrepareLaunch)
    )
  },
  agentStatus: {
    getSnapshot: runtimeImplementation.agentStatus.getSnapshot.handler(
      wireRuntimeMethod('agentStatus.getSnapshot', handleAgentStatusGetSnapshot)
    ),
    getMigrationUnsupportedSnapshot:
      runtimeImplementation.agentStatus.getMigrationUnsupportedSnapshot.handler(
        wireRuntimeMethod(
          'agentStatus.getMigrationUnsupportedSnapshot',
          handleAgentStatusGetMigrationUnsupportedSnapshot
        )
      ),
    inferInterrupt: runtimeImplementation.agentStatus.inferInterrupt.handler(
      wireRuntimeMethod('agentStatus.inferInterrupt', handleAgentStatusInferInterrupt)
    ),
    drop: runtimeImplementation.agentStatus.drop.handler(
      wireRuntimeMethod('agentStatus.drop', handleAgentStatusDrop)
    ),
    dropByTabPrefix: runtimeImplementation.agentStatus.dropByTabPrefix.handler(
      wireRuntimeMethod('agentStatus.dropByTabPrefix', handleAgentStatusDropByTabPrefix)
    ),
    retirePaneAuthority: runtimeImplementation.agentStatus.retirePaneAuthority.handler(
      wireRuntimeMethod('agentStatus.retirePaneAuthority', handleAgentStatusRetirePaneAuthority)
    ),
    transferPaneAuthority: runtimeImplementation.agentStatus.transferPaneAuthority.handler(
      wireRuntimeMethod('agentStatus.transferPaneAuthority', handleAgentStatusTransferPaneAuthority)
    ),
    events: {
      subscribe: runtimeImplementation.agentStatus.events.subscribe.handler(
        wireRuntimeStream('agentStatus.events.subscribe', handleAgentStatusEventsSubscribe)
      )
    }
  },
  notifications: {
    subscribe: runtimeImplementation.notifications.subscribe.handler(
      wireRuntimeStream('notifications.subscribe', handleNotificationsSubscribe)
    ),
    unsubscribe: runtimeImplementation.notifications.unsubscribe.handler(
      wireRuntimeMethod('notifications.unsubscribe', unsubscribeRuntimeNotifications)
    ),
    getMissedSince: runtimeImplementation.notifications.getMissedSince.handler(
      wireRuntimeMethod('notifications.getMissedSince', getMissedRuntimeNotifications)
    ),
    report: runtimeImplementation.notifications.report.handler(
      wireRuntimeMethod('notifications.report', reportRuntimeNotification)
    ),
    dismiss: runtimeImplementation.notifications.dismiss.handler(
      wireRuntimeMethod('notifications.dismiss', dismissRuntimeNotifications)
    )
  },
  mobile: {
    developmentPairing: runtimeImplementation.mobile.developmentPairing.handler(
      wireRuntimeMethod('mobile.developmentPairing', handleMobileDevelopmentPairing)
    ),
    hostPairing: {
      listNetworkInterfaces: runtimeImplementation.mobile.hostPairing.listNetworkInterfaces.handler(
        wireRuntimeMethod(
          'mobile.hostPairing.listNetworkInterfaces',
          handleMobileHostPairingListNetworkInterfaces
        )
      ),
      getPairingQR: runtimeImplementation.mobile.hostPairing.getPairingQR.handler(
        wireRuntimeMethod('mobile.hostPairing.getPairingQR', handleMobileHostPairingGetPairingQR)
      ),
      listDevices: runtimeImplementation.mobile.hostPairing.listDevices.handler(
        wireRuntimeMethod('mobile.hostPairing.listDevices', handleMobileHostPairingListDevices)
      ),
      revokeDevice: runtimeImplementation.mobile.hostPairing.revokeDevice.handler(
        wireRuntimeMethod('mobile.hostPairing.revokeDevice', handleMobileHostPairingRevokeDevice)
      ),
      isWebSocketReady: runtimeImplementation.mobile.hostPairing.isWebSocketReady.handler(
        wireRuntimeMethod(
          'mobile.hostPairing.isWebSocketReady',
          handleMobileHostPairingIsWebSocketReady
        )
      )
    }
  },
  session: {
    tabs: {
      list: runtimeImplementation.session.tabs.list.handler(
        wireRuntimeMethod('session.tabs.list', handleSessionTabsList)
      ),
      listAll: runtimeImplementation.session.tabs.listAll.handler(
        wireRuntimeMethod('session.tabs.listAll', handleSessionTabsListAll)
      ),
      activate: runtimeImplementation.session.tabs.activate.handler(
        wireRuntimeMethod('session.tabs.activate', handleSessionTabsActivate)
      ),
      close: runtimeImplementation.session.tabs.close.handler(
        wireRuntimeMethod('session.tabs.close', handleSessionTabsClose)
      ),
      createTerminal: runtimeImplementation.session.tabs.createTerminal.handler(
        wireRuntimeMethod('session.tabs.createTerminal', handleSessionTabsCreateTerminal)
      ),
      move: runtimeImplementation.session.tabs.move.handler(
        wireRuntimeMethod('session.tabs.move', handleSessionTabsMove)
      ),
      updatePaneLayout: runtimeImplementation.session.tabs.updatePaneLayout.handler(
        wireRuntimeMethod('session.tabs.updatePaneLayout', handleSessionTabsUpdatePaneLayout)
      ),
      setTabProps: runtimeImplementation.session.tabs.setTabProps.handler(
        wireRuntimeMethod('session.tabs.setTabProps', handleSessionTabsSetTabProps)
      ),
      // Why: subscribe/unsubscribe/subscribeAll/unsubscribeAll are wired here
      // too — a directly-wired domain must supply every procedure under its
      // top-level contract key or the omitted ones vanish from the router
      // entirely (see router-direct.ts's own note). None carries a legacy
      // registration anymore (methods/session-tabs.ts is fully retired).
      // `unsubscribe`/`unsubscribeAll` dropped theirs once `RpcDispatcher`
      // gained a fallback into this same direct wiring for unary
      // bare-envelope callers (docs/runtime-orpc-migration.md Phase 6 slice
      // 110); `subscribe`/`subscribeAll` (streaming) needed slice 112's
      // streaming sibling of that fallback
      // (legacy-dispatch-fallback.ts's `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`)
      // to serve the same bare-envelope caller that reaches them with no oRPC
      // negotiation.
      subscribe: runtimeImplementation.session.tabs.subscribe.handler(
        wireRuntimeStream('session.tabs.subscribe', handleSessionTabsSubscribe)
      ),
      unsubscribe: runtimeImplementation.session.tabs.unsubscribe.handler(
        wireRuntimeMethod('session.tabs.unsubscribe', handleSessionTabsUnsubscribe)
      ),
      subscribeAll: runtimeImplementation.session.tabs.subscribeAll.handler(
        wireRuntimeStream('session.tabs.subscribeAll', handleSessionTabsSubscribeAll)
      ),
      unsubscribeAll: runtimeImplementation.session.tabs.unsubscribeAll.handler(
        wireRuntimeMethod('session.tabs.unsubscribeAll', handleSessionTabsUnsubscribeAll)
      )
    }
  }
} as const
