import type {
  SharedControlConnectionState,
  SharedControlLogicalSubscription,
  SharedControlPendingRequest,
  SharedControlReadyWaiter
} from '@yiru/runtime-protocol/workbench/remote-runtime/shared-control-types'

import { remoteRuntimeUnavailableError } from './request-frames'
import { logSharedControlSocketClose } from './shared-control-diagnostics-log'
import { closeSharedControlSocketState } from './shared-control-state'
import {
  finishCloseAfterReadySubscriptions,
  finishNonReplayableSharedControlSubscriptions
} from './shared-control-subscriptions'

export function closeSharedControlSocket(args: {
  environmentId?: string
  state: SharedControlConnectionState
  ws: WebSocket | null
  socketCleanup: (() => void) | null
  pendingRequests: Map<string, SharedControlPendingRequest<unknown>>
  subscriptions: Map<string, SharedControlLogicalSubscription<unknown>>
  readyWaiters: SharedControlReadyWaiter[]
  lastClose: { code: number; reason: string } | null
  error?: Error
  clearReadyStableTimer: () => void
}): void {
  if (args.ws || args.socketCleanup) {
    logSharedControlSocketClose({
      environmentId: args.environmentId ?? 'unknown',
      state: args.state,
      pendingRequests: args.pendingRequests,
      subscriptions: args.subscriptions,
      lastClose: args.lastClose,
      error: args.error
    })
  }
  args.clearReadyStableTimer()
  finishCloseAfterReadySubscriptions(args.subscriptions)
  finishNonReplayableSharedControlSubscriptions(args.subscriptions, remoteRuntimeUnavailableError())
  closeSharedControlSocketState({
    readyWaiters: args.readyWaiters,
    pendingRequests: args.pendingRequests,
    subscriptions: args.subscriptions,
    socketCleanup: args.socketCleanup,
    ws: args.ws,
    error: args.error
  })
}
