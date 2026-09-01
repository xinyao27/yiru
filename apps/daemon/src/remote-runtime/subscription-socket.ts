import { RemoteRuntimeClientError } from '@yiru/runtime-protocol/workbench/remote-runtime/client-error'

import {
  createRemoteRuntimeSocket,
  pingRemoteRuntimeSocket,
  remoteRuntimeSocketBytes,
  terminateRemoteRuntimeSocket
} from './socket'
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
    socket = createRemoteRuntimeSocket(session.pairing.endpoint)
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

  function onClose(event: CloseEvent): void {
    session.handleSocketClose(event.code, event.reason)
  }

  function onMessage(event: MessageEvent<unknown>): void {
    session.noteActivity()
    if (typeof event.data === 'string') {
      handleRemoteRuntimeSubscriptionMessage(session, event.data)
      return
    }
    const bytes = remoteRuntimeSocketBytes(event.data)
    if (bytes) {
      handleRemoteRuntimeSubscriptionMessage(session, bytes)
      return
    }
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an unsupported binary frame.'
      )
    )
  }

  function onLivenessSignal(): void {
    session.noteActivity()
  }

  const detachListeners = (): void => {
    socket.removeEventListener('open', onOpen)
    socket.removeEventListener('error', onError)
    socket.removeEventListener('close', onClose)
    socket.removeEventListener('message', onMessage)
    socket.removeEventListener('pong', onLivenessSignal)
    socket.removeEventListener('ping', onLivenessSignal)
  }

  session.setSocket(socket, detachListeners)
  socket.addEventListener('open', onOpen, { once: true })
  socket.addEventListener('error', onError, { once: true })
  socket.addEventListener('close', onClose)
  socket.addEventListener('message', onMessage)
  socket.addEventListener('pong', onLivenessSignal)
  socket.addEventListener('ping', onLivenessSignal)

  // Why: dedicated streams ride the same tunnels as shared control; a
  // half-open drop must trigger the caller's resubscribe path.
  session.setLiveness(
    startRemoteRuntimeSocketLiveness({
      ping: () => {
        if (socket.readyState === WebSocket.OPEN) {
          pingRemoteRuntimeSocket(socket)
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
          terminateRemoteRuntimeSocket(socket)
        } catch {
          // Best-effort terminate; the subscription is already settled.
        }
      },
      options: livenessOptions
    })
  )
}
