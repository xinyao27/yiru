import type { JsonRpcNotification, JsonRpcRequest } from './frame-codec'

export type NotificationHandler = (method: string, params: Record<string, unknown>) => void
export type MethodNotificationHandler = (params: Record<string, unknown>) => void
export type RequestHandler = (params: Record<string, unknown>) => Promise<unknown> | unknown

export class MultiplexerSubscriptions {
  private notificationHandlers: NotificationHandler[] = []
  private requestHandlers = new Map<string, RequestHandler>()
  private methodNotificationHandlers = new Map<string, Set<MethodNotificationHandler>>()

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.push(handler)
    return () => {
      const index = this.notificationHandlers.indexOf(handler)
      if (index !== -1) {
        this.notificationHandlers.splice(index, 1)
      }
    }
  }

  onNotificationByMethod(method: string, handler: MethodNotificationHandler): () => void {
    let handlers = this.methodNotificationHandlers.get(method)
    if (!handlers) {
      handlers = new Set()
      this.methodNotificationHandlers.set(method, handlers)
    }
    handlers.add(handler)
    return () => {
      const current = this.methodNotificationHandlers.get(method)
      current?.delete(handler)
      if (current?.size === 0) {
        this.methodNotificationHandlers.delete(method)
      }
    }
  }

  onRequest(method: string, handler: RequestHandler): () => void {
    this.requestHandlers.set(method, handler)
    return () => {
      if (this.requestHandlers.get(method) === handler) {
        this.requestHandlers.delete(method)
      }
    }
  }

  async handleRequest(
    message: JsonRpcRequest,
    send: (response: {
      jsonrpc: '2.0'
      id: number
      result?: unknown
      error?: { code: number; message: string }
    }) => void
  ): Promise<void> {
    const handler = this.requestHandlers.get(message.method)
    if (!handler) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` }
      })
      return
    }
    try {
      const result = await handler(message.params ?? {})
      send({ jsonrpc: '2.0', id: message.id, result: result ?? null })
    } catch (error) {
      const code =
        error && typeof error === 'object' && typeof Reflect.get(error, 'code') === 'number'
          ? Reflect.get(error, 'code')
          : -32_000
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code, message: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  handleNotification(message: JsonRpcNotification): void {
    const params = message.params ?? {}
    for (const handler of this.notificationHandlers.slice()) {
      try {
        handler(message.method, params)
      } catch (error) {
        console.warn(
          `[channel-mux] Notification handler failed for ${message.method}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
    const methodHandlers = this.methodNotificationHandlers.get(message.method)
    // Why: handlers may unsubscribe while running; iterate a stable snapshot.
    for (const handler of methodHandlers ? Array.from(methodHandlers) : []) {
      try {
        handler(params)
      } catch (error) {
        console.warn(
          `[channel-mux] Method notification handler failed for ${message.method}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  }

  dispose(): void {
    this.notificationHandlers.length = 0
    this.methodNotificationHandlers.clear()
    this.requestHandlers.clear()
  }
}
