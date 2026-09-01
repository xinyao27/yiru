import type { RemoteRuntimeClientError } from '@yiru/runtime-protocol/workbench/remote-runtime/client-error'
import type {
  SharedControlConnectionState,
  SharedControlLogicalSubscription,
  SharedControlPendingRequest,
  SharedControlReadyWaiter
} from '@yiru/runtime-protocol/workbench/remote-runtime/shared-control-types'

import { parseAuthenticatedFrame, parseReadyFrame } from './request-frames'
import { dispatchSharedControlFrame } from './shared-control-frame-dispatch'
import { parseSharedControlFrame } from './shared-control-protocol'
import { resolveSharedControlReadyWaiters } from './shared-control-state'

export function handleSharedControlTextFrame(args: {
  frame: string
  state: SharedControlConnectionState
  sharedKey: Uint8Array | null
  deviceToken: string
  environmentId?: string
  pendingRequests: Map<string, SharedControlPendingRequest<unknown>>
  subscriptions: Map<string, SharedControlLogicalSubscription<unknown>>
  readyWaiters: SharedControlReadyWaiter[]
  setState: (state: SharedControlConnectionState) => void
  handleSocketClosed: (error: RemoteRuntimeClientError) => void
  sendEncrypted: (payload: unknown) => boolean
  handleOrpcText: (frame: string) => void
  markReady: () => void
  replaySubscriptions: () => void
}): void {
  if (args.state === 'awaiting_ready') {
    const error = parseReadyFrame(args.frame)
    if (error) {
      args.handleSocketClosed(error)
      return
    }
    args.setState('awaiting_authenticated')
    args.sendEncrypted({ type: 'e2ee_auth', deviceToken: args.deviceToken })
    return
  }

  const parsed = parseSharedControlFrame(args.frame, args.sharedKey, args.state)
  if (parsed.type === 'auth') {
    const error = parseAuthenticatedFrame(parsed.plaintext)
    if (error) {
      args.handleSocketClosed(error)
      return
    }
    args.setState('ready')
    args.markReady()
    resolveSharedControlReadyWaiters(args.readyWaiters)
    args.replaySubscriptions()
    return
  }

  if (parsed.type === 'error') {
    args.handleSocketClosed(parsed.error)
    return
  }

  if (parsed.type === 'orpc') {
    args.handleOrpcText(parsed.frame)
    return
  }

  dispatchSharedControlFrame({
    environmentId: args.environmentId,
    frame: parsed.frame,
    pendingRequests: args.pendingRequests,
    subscriptions: args.subscriptions,
    deviceToken: args.deviceToken,
    send: args.sendEncrypted
  })
}
