import { ClientRequestAborts } from './client-request-aborts'
import type { JsonRpcNotification, JsonRpcRequest } from './protocol'
import type { RelayClient } from './relay-client'

export type RequestContext = {
  clientId: number
  isStale: () => boolean
  signal?: AbortSignal
}

export type MethodHandler = (
  params: Record<string, unknown>,
  context: RequestContext
) => Promise<unknown>

export type NotificationHandler = (params: Record<string, unknown>, context: RequestContext) => void

type SendResponse = (
  client: RelayClient,
  id: number,
  result?: unknown,
  error?: { code: number; message: string; data?: unknown }
) => void

export class RelayInboundRouter {
  private readonly requestAborts = new ClientRequestAborts()
  private readonly requestHandlers = new Map<string, MethodHandler>()
  private readonly notificationHandlers = new Map<string, NotificationHandler>()
  private readonly isClientCurrent: (client: RelayClient, generation: number) => boolean
  private readonly sendResponse: SendResponse

  constructor(
    isClientCurrent: (client: RelayClient, generation: number) => boolean,
    sendResponse: SendResponse
  ) {
    this.isClientCurrent = isClientCurrent
    this.sendResponse = sendResponse
  }

  onRequest(method: string, handler: MethodHandler): void {
    this.requestHandlers.set(method, handler)
  }

  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler)
  }

  abortClient(clientId: number): void {
    this.requestAborts.abortClient(clientId)
  }

  dispose(): void {
    this.requestAborts.abortAll()
  }

  async handleRequest(client: RelayClient, request: JsonRpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(request.method)
    if (!handler) {
      this.sendResponse(client, request.id, undefined, {
        code: -32601,
        message: `Method not found: ${request.method}`
      })
      return
    }

    const generation = client.generation
    const { key: abortKey, controller } = this.requestAborts.create(client.id, request.id)
    const context: RequestContext = {
      clientId: client.id,
      isStale: () => !this.isClientCurrent(client, generation) || controller.signal.aborted,
      signal: controller.signal
    }
    try {
      const result = await handler(request.params ?? {}, context)
      if (!context.isStale()) {
        this.sendResponse(client, request.id, result)
      }
    } catch (error) {
      if (context.isStale()) {
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      const codeValue = error instanceof Error ? Reflect.get(error, 'code') : undefined
      const code = typeof codeValue === 'number' ? codeValue : -32000
      this.sendResponse(client, request.id, undefined, { code, message })
    } finally {
      this.requestAborts.delete(abortKey)
    }
  }

  handleNotification(client: RelayClient, notification: JsonRpcNotification): void {
    if (notification.method === 'rpc.cancel') {
      const id = Number((notification.params ?? {}).id)
      this.requestAborts.get(client.id, id)?.abort()
      return
    }
    const handler = this.notificationHandlers.get(notification.method)
    if (!handler) {
      return
    }
    const generation = client.generation
    handler(notification.params ?? {}, {
      clientId: client.id,
      isStale: () => !this.isClientCurrent(client, generation)
    })
  }
}
