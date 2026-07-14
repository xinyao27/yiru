import { randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import { E2EEChannel } from '../runtime/rpc/e2ee-channel'
import type { SpoolE2EEKeypair } from './spool-e2ee-keypair'
import type { SpoolRpcGateway, SpoolServerConnection } from './spool-rpc-gateway'
import type { SpoolTicketAuthority } from './spool-ticket-authority'
import type { TailnetPrincipal } from './tailnet-control'
import { SPOOL_MAX_STREAM_QUEUED_BYTES } from '../../shared/spool/spool-resource-limits'
import { SPOOL_PROTOCOL_VERSION } from '../../shared/spool/spool-wire-contract'
import { startSpoolWebSocketHeartbeat } from './spool-websocket-heartbeat'

export type OpenSpoolEncryptedConnectionOptions = {
  webSocket: WebSocket
  requester: TailnetPrincipal
  tickets: SpoolTicketAuthority
  keypair: SpoolE2EEKeypair
  gateway: SpoolRpcGateway
  ownerRuntimeId: string
  ownerKeyFingerprint: string
  onClosed: () => void
}

export function openSpoolEncryptedConnection(
  options: OpenSpoolEncryptedConnectionOptions
): () => void {
  const connectionId = randomUUID()
  let rpcConnection: SpoolServerConnection | null = null
  let closed = false
  const stopHeartbeat = startSpoolWebSocketHeartbeat(options.webSocket, () =>
    options.webSocket.terminate()
  )
  const channel = new E2EEChannel(options.webSocket, {
    serverSecretKey: options.keypair.secretKey,
    // Why: one noisy terminal must not consume the whole ordered connection queue.
    maxTextReplyQueuedBytesPerGroup: SPOOL_MAX_STREAM_QUEUED_BYTES,
    authenticate: (authFrame, context) => {
      const ticket = readSpoolTicket(authFrame)
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
          protocolVersion: SPOOL_PROTOCOL_VERSION
        },
        connectionId
      )
      return principal ? { principal } : null
    },
    onReady: (readyChannel) => {
      const principal = readyChannel.principal
      if (!principal || principal.kind !== 'spool') {
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

function readSpoolTicket(value: unknown): string | null {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  return record?.type === 'e2ee_auth' && typeof record.spoolTicket === 'string'
    ? record.spoolTicket
    : null
}
