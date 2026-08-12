import { encodeRuntimeOrpcSideChannelBinaryFrame } from '@yiru/runtime-protocol/orpc-peer-frame'
import type { WebSocket } from 'ws'
import { encodeRuntimeLoopbackError, encodeRuntimeLoopbackReady } from '~shared/runtime-loopback'

import { connectRuntimeEnvironmentOrpcBridge } from '../rpc/orpc/environment-orpc-bridge'
import { rawDataBytes, sendWebSocket } from './socket-frames'

const DEFAULT_ENVIRONMENT_CONNECT_TIMEOUT_MS = 15_000

export async function bindRuntimeEnvironmentLoopbackSocket(args: {
  ws: WebSocket
  userDataPath: string
  ownerId: string
  environmentId: string
  timeoutMs?: number
}): Promise<void> {
  const { ws } = args
  try {
    const tunnel = await connectRuntimeEnvironmentOrpcBridge({
      userDataPath: args.userDataPath,
      ownerId: args.ownerId,
      environmentId: args.environmentId,
      timeoutMs: args.timeoutMs ?? DEFAULT_ENVIRONMENT_CONNECT_TIMEOUT_MS,
      callbacks: {
        onText: (frame) => sendWebSocket(ws, frame),
        onBinary: (frame) => sendWebSocket(ws, frame),
        onSideChannelBinary: (requestId, frame) =>
          sendWebSocket(ws, encodeRuntimeOrpcSideChannelBinaryFrame(requestId, frame)),
        onClose: () => ws.close(1011, 'Remote runtime tunnel closed')
      }
    })
    if (ws.readyState !== ws.OPEN) {
      tunnel.close()
      return
    }
    ws.on('message', (data, isBinary) => {
      const sent = isBinary
        ? tunnel.sendBinary(rawDataBytes(data))
        : tunnel.sendText(data.toString())
      if (!sent) {
        ws.close(1011, 'Remote runtime tunnel unavailable')
      }
    })
    ws.once('close', () => tunnel.close())
    sendWebSocket(ws, encodeRuntimeLoopbackReady(args.environmentId))
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'unsupported'
        ? 'unsupported'
        : 'unavailable'
    sendWebSocket(
      ws,
      encodeRuntimeLoopbackError(
        code,
        error instanceof Error ? error.message : 'Remote runtime tunnel unavailable'
      )
    )
    ws.close(1011, 'Remote runtime tunnel unavailable')
  }
}
