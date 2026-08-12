import { encodeRuntimeOrpcSideChannelBinaryFrame } from '@yiru/runtime-protocol/orpc-peer-frame'
import type { MessagePortMain } from 'electron'
import {
  RUNTIME_ORPC_PORT_ERROR_MESSAGE,
  RUNTIME_ORPC_PORT_READY_MESSAGE,
  type RuntimeOrpcConnectTarget
} from '~shared/runtime-orpc-message-port'

import {
  connectRuntimeEnvironmentOrpcBridge,
  RuntimeEnvironmentOrpcBridgeError
} from './environment-orpc-bridge'

const DEFAULT_RUNTIME_ORPC_CONNECT_TIMEOUT_MS = 15_000

type EnvironmentOrpcTarget = Extract<RuntimeOrpcConnectTarget, { kind: 'environment' }>

export async function connectRuntimeEnvironmentOrpcMessagePort(args: {
  userDataPath: string
  ownerId: string
  target: EnvironmentOrpcTarget
  port: MessagePortMain
}): Promise<void> {
  let isClosed = false
  let closeTunnel: (() => void) | null = null
  const closePort = (): void => {
    if (isClosed) {
      return
    }
    isClosed = true
    closeTunnel?.()
  }
  args.port.once('close', closePort)
  args.port.start()

  const timeoutMs = args.target.timeoutMs ?? DEFAULT_RUNTIME_ORPC_CONNECT_TIMEOUT_MS
  try {
    const tunnel = await connectRuntimeEnvironmentOrpcBridge({
      userDataPath: args.userDataPath,
      ownerId: args.ownerId,
      environmentId: args.target.environmentId,
      timeoutMs,
      callbacks: {
        onText: (frame) => args.port.postMessage(frame),
        onBinary: (frame) => args.port.postMessage(frame),
        onSideChannelBinary: (requestId, frame) =>
          args.port.postMessage(encodeRuntimeOrpcSideChannelBinaryFrame(requestId, frame)),
        onClose: () => setTimeout(() => args.port.close(), 0)
      }
    })
    closeTunnel = tunnel.close
    if (isClosed) {
      tunnel.close()
      return
    }
    args.port.on('message', (event) => {
      const frame = toTunnelFrame(event.data)
      if (frame === null) {
        args.port.close()
        return
      }
      if (typeof frame === 'string') {
        tunnel.sendText(frame)
      } else {
        tunnel.sendBinary(frame)
      }
    })
    args.port.postMessage({ type: RUNTIME_ORPC_PORT_READY_MESSAGE })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    postBootstrapError(
      args.port,
      error instanceof RuntimeEnvironmentOrpcBridgeError ? error.code : 'unavailable',
      message
    )
  }
}

function postBootstrapError(
  port: MessagePortMain,
  code: 'unsupported' | 'unavailable',
  message: string
): void {
  port.postMessage({ type: RUNTIME_ORPC_PORT_ERROR_MESSAGE, code, message })
  // Why: let the queued bootstrap error cross the port before closing its route.
  setTimeout(() => port.close(), 0)
}

function toTunnelFrame(value: unknown): string | Uint8Array<ArrayBufferLike> | null {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}
