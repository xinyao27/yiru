import { randomUUID } from 'node:crypto'

import type { WebSocket } from 'ws'
import { COWORKING_MAX_STREAM_QUEUED_BYTES } from '~shared/coworking/resource-limits'
import { COWORKING_PROTOCOL_VERSION } from '~shared/coworking/wire-contract'

import { E2EEChannel } from '../runtime/rpc/e2ee-channel'
import type { CoworkingE2EEKeypair } from './e2ee-keypair'
import type { CoworkingRpcGateway, CoworkingServerConnection } from './rpc/gateway'
import type { TailnetPrincipal } from './tailnet-control'
import type { CoworkingTicketAuthority } from './ticket-authority'
import { startCoworkingWebSocketHeartbeat } from './websocket-heartbeat'

export type OpenCoworkingEncryptedConnectionOptions = {
  webSocket: WebSocket
  requester: TailnetPrincipal
  tickets: CoworkingTicketAuthority
  keypair: CoworkingE2EEKeypair
  gateway: CoworkingRpcGateway
  ownerRuntimeId: string
  ownerKeyFingerprint: string
  onClosed: () => void
}

export function openCoworkingEncryptedConnection(
  options: OpenCoworkingEncryptedConnectionOptions
): () => void {
  const connectionId = randomUUID()
  let rpcConnection: CoworkingServerConnection | null = null
  let closed = false
  const stopHeartbeat = startCoworkingWebSocketHeartbeat(options.webSocket, () =>
    options.webSocket.terminate()
  )
  const channel = new E2EEChannel(options.webSocket, {
    serverSecretKey: options.keypair.secretKey,
    // Why: one noisy terminal must not consume the whole ordered connection queue.
    maxTextReplyQueuedBytesPerGroup: COWORKING_MAX_STREAM_QUEUED_BYTES,
    authenticate: (authFrame, context) => {
      const ticket = readCoworkingTicket(authFrame)
      if (!ticket) {
        return null
      }
      const principal = options.tickets.consume(
        ticket,
        {
          requester: options.requester,
          clientPublicKeyB64: context.clientPublicKeyB64,
          ownerRuntimeId: options.ownerRuntimeId,
          ownerKeyFingerprint: options.ownerKeyFingerprint,
          protocolVersion: COWORKING_PROTOCOL_VERSION
        },
        connectionId
      )
      return principal ? { principal } : null
    },
    onReady: (readyChannel) => {
      const principal = readyChannel.principal
      if (!principal || principal.kind !== 'coworking') {
        options.webSocket.close(4001, 'Unauthorized')
        return
      }
      rpcConnection = options.gateway.openConnection(principal, {
        sendJson: (frame, streamKey) => void readyChannel.sendText(frame, streamKey),
        // Why: authorization invalidation must discard application and kernel
        // backlogs; a graceful close may flush frames from the former epoch.
        close: () => options.webSocket.terminate()
      })
    },
    onError: (code, reason) => {
      if (code === 1013) {
        // Why: an overflowed peer must not flush stale queued frames during a close handshake.
        options.webSocket.terminate()
        return
      }
      options.webSocket.close(code, reason)
    }
  })
  channel.onMessage((plaintext) => rpcConnection?.dispatchJson(plaintext))
  channel.onBinaryMessage((frame) => rpcConnection?.dispatchBinary(frame))
  options.webSocket.on('message', (data, isBinary) => {
    channel.handleRawMessage(isBinary ? new Uint8Array(data as Buffer) : data.toString())
  })

  const close = (): void => {
    if (closed) {
      return
    }
    closed = true
    stopHeartbeat()
    channel.destroy()
    try {
      rpcConnection?.close()
    } finally {
      options.onClosed()
      if (options.webSocket.readyState !== options.webSocket.CLOSED) {
        options.webSocket.terminate()
      }
    }
  }
  options.webSocket.once('error', close)
  options.webSocket.once('close', close)
  return close
}

function readCoworkingTicket(value: unknown): string | null {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  return record?.type === 'e2ee_auth' && typeof record.coworkingTicket === 'string'
    ? record.coworkingTicket
    : null
}
