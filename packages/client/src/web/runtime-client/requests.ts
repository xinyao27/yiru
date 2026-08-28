import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '@yiru/runtime-protocol/workbench/runtime-method-contract'

import type { WebRuntimeOrpcClient } from '../orpc-channel'
import { WebRuntimeClientContract } from './contract'
import { abortError } from './protocol-values'
import { REQUEST_TIMEOUT_MS } from './state'

export abstract class WebRuntimeClientRequests extends WebRuntimeClientContract {
  call<TContract extends RuntimeMethodContract>(
    contract: TContract,
    params: RuntimeMethodParams<TContract>,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<RuntimeRpcResponse<RuntimeMethodResult<TContract>>>
  call(
    contract: string,
    params?: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<RuntimeRpcResponse<unknown>>
  async call(
    contract: string | RuntimeMethodContract,
    params?: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<RuntimeRpcResponse<unknown>> {
    const method = typeof contract === 'string' ? contract : contract.name
    await this.waitForConnected(options?.timeoutMs, options?.signal)
    return new Promise((resolve, reject) => {
      const id = this.nextId()
      const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
      const timeout = window.setTimeout(() => {
        this.pending.delete(id)
        removeAbortListener()
        reject(new Error(`Request timed out: ${method}`))
      }, timeoutMs)
      const abort = (): void => {
        this.pending.delete(id)
        window.clearTimeout(timeout)
        removeAbortListener()
        reject(abortError(options?.signal))
      }
      const removeAbortListener = (): void => options?.signal?.removeEventListener('abort', abort)
      if (options?.signal?.aborted) {
        window.clearTimeout(timeout)
        reject(abortError(options.signal))
        return
      }
      options?.signal?.addEventListener('abort', abort, { once: true })
      this.pending.set(id, { method, resolve, reject, timeout, removeAbortListener })
      if (!this.sendEncrypted({ id, deviceToken: this.pairing.deviceToken, method, params })) {
        this.pending.delete(id)
        window.clearTimeout(timeout)
        removeAbortListener()
        reject(new Error('Runtime host is not connected.'))
      }
    })
  }

  async getOrpcClient(
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient> {
    await this.waitForConnected(timeoutMs, signal)
    if (this.orpcTransport === 'peer') {
      return this.getPeerOrpcClient()
    }
    if (this.orpcTransport === 'legacy') {
      return this.getLegacyOrpcClient()
    }
    if (!this.orpcClientPromise) {
      // Why: a runtime-scoped pairing is issued by the pure Node host, whose
      // WebSocket surface is oRPC-only. Probing it with the legacy JSON envelope
      // is an invalid frame, so authenticate its identity with typed status.get.
      this.orpcClientPromise =
        this.pairing.scope === 'runtime'
          ? this.connectRuntimeOrpcClient(timeoutMs, signal)
          : this.negotiateOrpcClient(timeoutMs, signal)
    }
    const pendingClient = this.orpcClientPromise
    try {
      return await pendingClient
    } finally {
      if (this.orpcClientPromise === pendingClient) {
        this.orpcClientPromise = null
      }
    }
  }
}
