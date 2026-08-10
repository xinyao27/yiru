import WebSocket from 'ws'

import type { BrowserPageCdpEvent } from '../page/handle'

type PendingCommand = {
  reject: (reason: Error) => void
  resolve: (value: unknown) => void
}

const CONNECTION_TIMEOUT_MS = 10_000

export class ChromeCdpTransport {
  private readonly pendingCommands = new Map<number, PendingCommand>()
  private readonly listeners = new Set<(event: BrowserPageCdpEvent) => void>()
  private readonly socket: WebSocket
  private nextCommandId = 0
  private didDisconnect = false

  private constructor(socket: WebSocket) {
    this.socket = socket
    socket.on('message', (data) => this.handleMessage(data.toString()))
    socket.once('close', () => this.disconnect('Chrome DevTools connection closed'))
    socket.once('error', (error) => this.disconnect(error.message))
  }

  static connect(endpoint: string): Promise<ChromeCdpTransport> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint)
      let settled = false
      const timer = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        socket.terminate()
        reject(new Error('Timed out connecting to Chrome DevTools'))
      }, CONNECTION_TIMEOUT_MS)
      timer.unref?.()

      const cleanup = (): void => {
        clearTimeout(timer)
        socket.off('open', handleOpen)
        socket.off('error', handleError)
      }
      const handleOpen = (): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        resolve(new ChromeCdpTransport(socket))
      }
      const handleError = (error: Error): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        reject(new Error(`Could not connect to Chrome DevTools: ${error.message}`))
      }
      socket.once('open', handleOpen)
      socket.once('error', handleError)
    })
  }

  isConnected(): boolean {
    return !this.didDisconnect && this.socket.readyState === WebSocket.OPEN
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Chrome DevTools connection is not available'))
    }
    const id = ++this.nextCommandId
    return new Promise((resolve, reject) => {
      this.pendingCommands.set(id, { reject, resolve })
      const payload = sessionId ? { id, method, params, sessionId } : { id, method, params }
      this.socket.send(JSON.stringify(payload), (error) => {
        if (!error) {
          return
        }
        this.pendingCommands.delete(id)
        reject(new Error(`Could not send Chrome DevTools command: ${error.message}`))
      })
    })
  }

  subscribe(listener: (event: BrowserPageCdpEvent) => void): () => void {
    if (this.didDisconnect) {
      listener({ type: 'detached', reason: 'Chrome DevTools connection closed' })
      return () => {}
    }
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    if (this.didDisconnect) {
      return
    }
    this.socket.close()
    this.disconnect('Chrome DevTools connection closed')
  }

  private handleMessage(raw: string): void {
    let message: unknown
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (!isRecord(message)) {
      return
    }

    const id = message.id
    if (typeof id === 'number') {
      const pending = this.pendingCommands.get(id)
      if (!pending) {
        return
      }
      this.pendingCommands.delete(id)
      if (message.error !== undefined) {
        pending.reject(toCommandError(message.error))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (typeof message.method !== 'string') {
      return
    }
    const event: BrowserPageCdpEvent = {
      type: 'message',
      method: message.method,
      params: isRecord(message.params) ? message.params : {},
      ...(typeof message.sessionId === 'string' ? { sessionId: message.sessionId } : {})
    }
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private disconnect(reason: string): void {
    if (this.didDisconnect) {
      return
    }
    this.didDisconnect = true
    const error = new Error(reason)
    for (const pending of this.pendingCommands.values()) {
      pending.reject(error)
    }
    this.pendingCommands.clear()
    for (const listener of this.listeners) {
      listener({ type: 'detached', reason })
    }
    this.listeners.clear()
  }
}

function toCommandError(value: unknown): Error {
  const error = isRecord(value) ? value : {}
  const message =
    typeof error.message === 'string' ? error.message : 'Chrome DevTools command failed'
  const code = typeof error.code === 'number' ? ` (${error.code})` : ''
  return new Error(`${message}${code}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
