import type { Socket } from 'node:net'
import { StringDecoder } from 'node:string_decoder'

import type { DaemonFileLog } from './file-log'
import { createNdjsonParser, encodeNdjson } from './ndjson'
import type { ConnectedDaemonClient } from './server-types'
import type { DaemonStreamDataBatcher } from './stream-data-batcher'
import { PROTOCOL_VERSION, type DaemonRequest, type HelloMessage } from './types'

type DaemonConnectionContext = {
  token: string
  clients: Map<string, ConnectedDaemonClient>
  log: DaemonFileLog
  streamDataBatcher: DaemonStreamDataBatcher
  onControlRequest: (socket: Socket, clientId: string, request: DaemonRequest) => void
}

export function acceptDaemonConnection(socket: Socket, context: DaemonConnectionContext): void {
  // Why: socket chunks can split multibyte prompt and input characters.
  const decoder = new StringDecoder('utf8')
  const parser = createNdjsonParser(
    (message) => handleHello(socket, message, context),
    () => socket.destroy()
  )
  socket.on('data', (chunk) => parser.feed(decoder.write(chunk)))
  socket.on('error', () => socket.destroy())
}

function handleHello(socket: Socket, message: unknown, context: DaemonConnectionContext): void {
  const hello = message as HelloMessage
  if (hello.type !== 'hello') {
    rejectHello(socket, context.log, 'expected-hello', 'Expected hello')
    return
  }
  if (hello.version !== PROTOCOL_VERSION) {
    context.log.log('client-hello-rejected', {
      reason: 'protocol-mismatch',
      clientVersion: hello.version
    })
    rejectHello(socket, context.log, 'protocol-mismatch', 'Protocol version mismatch', false)
    return
  }
  if (hello.token !== context.token) {
    context.log.log('client-hello-rejected', { reason: 'invalid-token', role: hello.role })
    rejectHello(socket, context.log, 'invalid-token', 'Invalid token', false)
    return
  }
  context.log.log('client-hello-accepted', { role: hello.role, clientId: hello.clientId })
  socket.write(encodeNdjson({ type: 'hello', ok: true }))
  if (hello.role === 'control') {
    registerControlSocket(socket, hello.clientId, context)
    return
  }
  const client = context.clients.get(hello.clientId)
  if (!client) {
    socket.destroy()
    return
  }
  registerStreamSocket(socket, client, context)
}

function rejectHello(
  socket: Socket,
  log: DaemonFileLog,
  reason: string,
  error: string,
  shouldLog = true
): void {
  if (shouldLog) {
    log.log('client-hello-rejected', { reason })
  }
  socket.write(encodeNdjson({ type: 'hello', ok: false, error }))
  socket.destroy()
}

function registerControlSocket(
  socket: Socket,
  clientId: string,
  context: DaemonConnectionContext
): void {
  const previous = context.clients.get(clientId)
  const client: ConnectedDaemonClient = { clientId, controlSocket: socket, streamSocket: null }
  context.clients.set(clientId, client)
  const decoder = new StringDecoder('utf8')
  const parser = createNdjsonParser(
    (message) => context.onControlRequest(socket, clientId, message as DaemonRequest),
    () => {}
  )
  socket.removeAllListeners('data')
  socket.on('data', (chunk) => parser.feed(decoder.write(chunk)))
  socket.on('close', () => {
    const current = context.clients.get(clientId)
    if (current?.controlSocket !== socket) {
      return
    }
    context.streamDataBatcher.clear(clientId)
    current.streamSocket?.destroy()
    context.clients.delete(clientId)
  })
  if (previous) {
    // Why: reconnect ownership is installed before old sockets close so stale
    // close events cannot delete the replacement entry.
    previous.streamSocket?.destroy()
    previous.controlSocket.destroy()
  }
}

function registerStreamSocket(
  socket: Socket,
  client: ConnectedDaemonClient,
  context: DaemonConnectionContext
): void {
  const previous = client.streamSocket
  socket.removeAllListeners('data')
  client.streamSocket = socket
  socket.on('drain', () => context.streamDataBatcher.flush(client.clientId))
  const cleanup = (): void => {
    socket.removeListener('close', cleanup)
    socket.removeListener('error', cleanup)
    if (context.clients.get(client.clientId) !== client || client.streamSocket !== socket) {
      return
    }
    context.streamDataBatcher.clear(client.clientId)
    client.streamSocket = null
  }
  socket.on('close', cleanup)
  socket.on('error', cleanup)
  if (previous && previous !== socket) {
    previous.destroy()
  }
}
