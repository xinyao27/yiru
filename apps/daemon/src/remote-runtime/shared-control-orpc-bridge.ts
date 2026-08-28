import type { RemoteRuntimeClientError } from '@yiru/runtime-protocol/workbench/remote-runtime/client-error'
import type {
  RemoteRuntimeOrpcTunnel,
  SharedControlConnectionState,
  SharedControlOrpcTunnelCallbacks
} from '@yiru/runtime-protocol/workbench/remote-runtime/shared-control-types'

import { SharedControlOrpcTunnels } from './shared-control-orpc-tunnels'
import {
  parseSharedControlBinaryFrame,
  sendSharedControlOrpcBinary,
  sendSharedControlOrpcText
} from './shared-control-protocol'

type SharedControlOrpcTransportState = {
  state: SharedControlConnectionState
  ws: WebSocket | null
  sharedKey: Uint8Array | null
}

export class SharedControlOrpcBridge {
  private readonly tunnels: SharedControlOrpcTunnels

  private readonly options: {
    ensureReady: (timeoutMs: number) => Promise<void>
    getTransportState: () => SharedControlOrpcTransportState
    handleSocketClosed: (error: RemoteRuntimeClientError) => void
  }

  constructor(options: {
    ensureReady: (timeoutMs: number) => Promise<void>
    getTransportState: () => SharedControlOrpcTransportState
    handleSocketClosed: (error: RemoteRuntimeClientError) => void
  }) {
    this.options = options
    this.tunnels = new SharedControlOrpcTunnels({
      ensureReady: options.ensureReady,
      sendText: (frame) => sendSharedControlOrpcText({ ...options.getTransportState(), frame }),
      sendBinary: (frame) => sendSharedControlOrpcBinary({ ...options.getTransportState(), frame })
    })
  }

  connect(
    ownerId: string,
    timeoutMs: number,
    callbacks: SharedControlOrpcTunnelCallbacks
  ): Promise<RemoteRuntimeOrpcTunnel> {
    return this.tunnels.connect(ownerId, timeoutMs, callbacks)
  }

  handleText(frame: string): void {
    this.tunnels.handleText(frame)
  }

  handleEncryptedBinary(frame: Uint8Array<ArrayBufferLike>): void {
    const state = this.options.getTransportState()
    const parsed = parseSharedControlBinaryFrame(frame, state.sharedKey, state.state)
    if (parsed.type === 'error') {
      this.options.handleSocketClosed(parsed.error)
      return
    }
    if (parsed.type === 'orpc-side-channel') {
      this.tunnels.handleSideChannel(parsed.requestId, parsed.frame)
    } else {
      this.tunnels.handleBinary(parsed.frame)
    }
  }

  closeAll(error: Error): void {
    this.tunnels.closeAll(error)
  }
}
