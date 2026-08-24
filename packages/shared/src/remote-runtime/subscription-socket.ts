import type { Buffer } from 'node:buffer'

import WebSocket from 'ws'

import { RemoteRuntimeClientError } from './client-error'
import { ignoreSettledRemoteRuntimeSocketError } from './client-socket'
import { startRemoteRuntimeSocketLiveness } from './socket-liveness'
import type { RemoteRuntimeSocketLivenessOptions } from './socket-liveness'
import { handleRemoteRuntimeSubscriptionMessage } from './subscription-frames'
import type { RemoteRuntimeSubscriptionSession } from './subscription-session'

export function openRemoteRuntimeSubscriptionSocket<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  livenessOptions?: RemoteRuntimeSocketLivenessOptions
): void {
  let socket: WebSocket
  try {
    socket = new WebSocket(session.pairing.endpoint)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    session.fail(
      new RemoteRuntimeClientError('invalid_argument', `Invalid remote endpoint: ${message}`)
    )
    return
  }

  function onOpen(): void {
    socket.send(
      JSON.stringify({
        type: 'e2ee_hello',
        publicKeyB64: session.publicKeyB64()
      })
    )
  }

  function onError(): void {
    session.fail(
      new RemoteRuntimeClientError(
        'remote_runtime_unavailable',
        'Could not connect to the runtime host.'
      )
    )
  }

  function onClose(code: number, reason: Buffer): void {
    session.handleSocketClose(code, reason)
  }

  function onMessage(data: WebSocket.RawData, isBinary: boolean): void {
    session.noteActivity()
    handleRemoteRuntimeSubscriptionMessage(session, data, isBinary)
  }

  function onLivenessSignal(): void {
    session.noteActivity()
  }

  const detachListeners = (): void => {
    socket.off('open', onOpen)
    socket.off('error', onError)
    socket.off('close', onClose)
    socket.off('message', onMessage)
    socket.off('pong', onLivenessSignal)
    socket.off('ping', onLivenessSignal)
    // Why: cleanup detaches Yiru callbacks before close, but ws can still emit
    // a late transport error while shutdown is in flight.
    if (socket.readyState !== WebSocket.CLOSED) {
      socket.on('error', ignoreSettledRemoteRuntimeSocketError)
    }
  }

  session.setSocket(socket, detachListeners)
  socket.once('open', onOpen)
  socket.once('error', onError)
  socket.on('close', onClose)
  socket.on('message', onMessage)
  socket.on('pong', onLivenessSignal)
  socket.on('ping', onLivenessSignal)

  // Why: dedicated streams ride the same tunnels as shared control; a
  // half-open drop must trigger the caller's resubscribe path.
  session.setLiveness(
    startRemoteRuntimeSocketLiveness({
      ping: () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.ping()
        }
      },
      onDead: () => {
        // Why: fail first so listeners detach before terminate emits close.
        session.fail(
          new RemoteRuntimeClientError(
            'remote_runtime_unavailable',
            'Runtime host stopped responding; the stream connection was reset.'
          )
        )
        try {
          socket.terminate()
        } catch {
          // Best-effort terminate; the subscription is already settled.
        }
      },
      options: livenessOptions
    })
  )
}
