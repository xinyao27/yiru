import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import { encrypt } from '../../shared/e2ee-crypto'
import type { SpoolPendingPeerRequest } from './spool-peer-response-dispatch'
import { clearPendingRequest } from './spool-peer-response-dispatch'

export function sendSpoolPeerCancellation(options: {
  socket: WebSocket | null
  sharedKey: Uint8Array | null
  method: string
  requestId: string
}): void {
  if (!options.socket || options.socket.readyState !== WebSocket.OPEN || !options.sharedKey) {
    return
  }
  options.socket.send(
    encrypt(
      JSON.stringify({
        id: randomUUID(),
        method: options.method,
        params: { requestId: options.requestId }
      }),
      options.sharedKey
    )
  )
}

export function abortSpoolPendingPeerRequest(options: {
  pendingRequests: Map<string, SpoolPendingPeerRequest>
  requestId: string
  pending: SpoolPendingPeerRequest
  sendCancellation(): void
}): void {
  if (options.pendingRequests.get(options.requestId) !== options.pending) {
    return
  }
  options.pendingRequests.delete(options.requestId)
  clearPendingRequest(options.pending)
  if (!options.pending.mutation) {
    options.sendCancellation()
  }
  const reason = options.pending.signal?.reason
  options.pending.reject(reason instanceof Error ? reason : createAbortError())
}

function createAbortError(): Error {
  const error = new Error('Spool request cancelled')
  error.name = 'AbortError'
  return error
}
