import type { JsonRpcRequest, JsonRpcResponse } from './frame-codec'

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  cleanup: () => void
}

const REQUEST_TIMEOUT_MS = 30_000

function createAbortError(method: string): Error {
  const error = new Error(`Request "${method}" was cancelled`)
  error.name = 'AbortError'
  return error
}

export class PendingRequestRegistry {
  private nextRequestId = 1
  private pending = new Map<number, PendingRequest>()

  request(
    method: string,
    params: Record<string, unknown> | undefined,
    options: { signal?: AbortSignal; timeoutMs?: number } | undefined,
    send: (message: JsonRpcRequest) => void,
    cancelRemote: (id: number) => void
  ): Promise<unknown> {
    if (options?.signal?.aborted) {
      return Promise.reject(createAbortError(method))
    }
    const id = this.nextRequestId++
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {})
    }
    const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS

    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const cleanup = (): void => {
        clearTimeout(timer)
        options?.signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        const pending = this.pending.get(id)
        if (!pending) {
          return
        }
        pending.cleanup()
        this.pending.delete(id)
        cancelRemote(id)
        pending.reject(createAbortError(method))
      }
      timer = setTimeout(() => {
        const pending = this.pending.get(id)
        if (pending) {
          pending.cleanup()
          cancelRemote(id)
        }
        this.pending.delete(id)
        reject(new Error(`Request "${method}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      options?.signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, { resolve, reject, cleanup })
      send(message)
    })
  }

  handleResponse(message: JsonRpcResponse): void {
    const pending = this.pending.get(message.id)
    if (!pending) {
      return
    }
    pending.cleanup()
    this.pending.delete(message.id)
    if (message.error) {
      const error = new Error(message.error.message)
      Object.defineProperty(error, 'code', { value: message.error.code })
      Object.defineProperty(error, 'data', { value: message.error.data })
      pending.reject(error)
    } else {
      pending.resolve(message.result)
    }
  }

  dispose(reason: 'shutdown' | 'connection_lost'): void {
    const message =
      reason === 'connection_lost' ? 'Connection lost, reconnecting...' : 'Multiplexer disposed'
    const code = reason === 'connection_lost' ? 'CONNECTION_LOST' : 'DISPOSED'
    for (const [id, pending] of this.pending) {
      pending.cleanup()
      const error = new Error(message)
      Object.defineProperty(error, 'code', { value: code })
      pending.reject(error)
      this.pending.delete(id)
    }
  }
}
