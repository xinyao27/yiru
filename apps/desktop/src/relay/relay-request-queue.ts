import type { JsonRpcRequest, JsonRpcResponse } from './protocol'

type PendingRelayRequest = {
  reject: (error: Error) => void
  resolve: (result: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const RELAY_TO_CLIENT_REQUEST_TIMEOUT_MS = 30_000

export class RelayRequestQueue {
  private readonly pending = new Map<number, PendingRelayRequest>()
  private nextRequestId = 1

  request(
    method: string,
    params: Record<string, unknown> | undefined,
    options: { timeoutMs?: number } | undefined,
    send: (message: JsonRpcRequest) => void
  ): Promise<unknown> {
    const id = this.nextRequestId++
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {})
    }
    const timeoutMs = options?.timeoutMs ?? RELAY_TO_CLIENT_REQUEST_TIMEOUT_MS
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request "${method}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      send(message)
    })
  }

  handleResponse(message: JsonRpcResponse): void {
    const pending = this.pending.get(message.id)
    if (!pending) {
      return
    }
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (message.error) {
      pending.reject(
        Object.assign(new Error(message.error.message), {
          code: message.error.code,
          data: message.error.data
        })
      )
      return
    }
    pending.resolve(message.result)
  }

  dispose(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Relay dispatcher disposed'))
      this.pending.delete(id)
    }
  }
}
