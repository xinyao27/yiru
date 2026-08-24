import { connect, type Socket } from 'node:net'
import { StringDecoder } from 'node:string_decoder'

import { encodeNdjson } from './ndjson'
import { addNodePtyRecoveryHint } from './node-pty-error-hints'
import { DaemonProtocolError, type HelloMessage, type HelloResponse } from './types'

const CONNECT_TIMEOUT_MS = 5000

export function connectDaemonSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath)
    const cleanup = (): void => {
      clearTimeout(timer)
      socket.removeListener('connect', onConnect)
      socket.removeListener('error', onError)
    }
    const onConnect = (): void => {
      cleanup()
      resolve(socket)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const timer = setTimeout(() => {
      cleanup()
      socket.destroy()
      reject(new DaemonProtocolError('Connection timed out'))
    }, CONNECT_TIMEOUT_MS)

    socket.on('connect', onConnect)
    socket.on('error', onError)
  })
}

export function sendDaemonHello(args: {
  clientId: string
  protocolVersion: number
  role: 'control' | 'stream'
  socket: Socket
  token: string
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const hello: HelloMessage = {
      type: 'hello',
      version: args.protocolVersion,
      token: args.token,
      clientId: args.clientId,
      role: args.role
    }
    let buffer = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      args.socket.removeListener('data', onData)
      args.socket.removeListener('error', onError)
      args.socket.removeListener('close', onClose)
    }
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (error) {
        reject(error)
        return
      }
      resolve()
    }
    // Why: socket chunks can split multibyte terminal text; keep incomplete
    // UTF-8 bytes until the next chunk instead of injecting replacement text.
    const decoder = new StringDecoder('utf8')
    const onData = (chunk: Buffer): void => {
      buffer += decoder.write(chunk)
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) {
        return
      }
      const line = buffer.slice(0, newlineIndex)
      try {
        const response = JSON.parse(line) as HelloResponse
        finish(
          response.ok
            ? undefined
            : new DaemonProtocolError(addNodePtyRecoveryHint(response.error ?? 'Hello rejected'))
        )
      } catch {
        finish(new DaemonProtocolError('Invalid hello response'))
      }
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void =>
      finish(new DaemonProtocolError('Connection closed before hello response'))

    timer = setTimeout(() => {
      finish(new DaemonProtocolError('Hello response timed out'))
      args.socket.destroy()
    }, CONNECT_TIMEOUT_MS)
    args.socket.on('data', onData)
    args.socket.on('error', onError)
    args.socket.on('close', onClose)
    args.socket.write(encodeNdjson(hello))
  })
}
