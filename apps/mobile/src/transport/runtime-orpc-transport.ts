import { createORPCClient, type ClientLink, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import { RUNTIME_ORPC_REQUEST_ID_HEADER } from '@yiru/runtime-protocol/orpc-peer-frame'

import type { BrowserScreencastFrame } from './browser-screencast-protocol'
import { markRpcDeliveryUnknown } from './rpc-delivery-ambiguity'
import { MobileRuntimeOrpcChannel } from './runtime-orpc-channel'
import type { RuntimeOrpcClient } from './runtime-orpc-client'
import { isRuntimeOrpcStreamPath } from './runtime-orpc-compatibility'
import { MobileRuntimeOrpcSubscriptions } from './runtime-orpc-subscriptions'

type RuntimeOrpcTransportOptions = {
  waitForConnected: (signal?: AbortSignal) => Promise<void>
  getState: () => string
  nextRequestId: () => string
  sendText: (plaintext: string) => boolean
  sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) => boolean
  registerTerminalStream: (streamId: number, listener: (event: unknown) => void) => () => void
}

export class MobileRuntimeOrpcTransport {
  readonly client: RuntimeOrpcClient
  private readonly options: RuntimeOrpcTransportOptions
  private readonly changeListeners = new Set<() => void>()
  private channel: MobileRuntimeOrpcChannel | null = null
  private link: ClientLink<Record<never, never>> | null = null
  private generation = 0
  private isClosed = false
  private readonly subscriptions: MobileRuntimeOrpcSubscriptions

  constructor(options: RuntimeOrpcTransportOptions) {
    this.options = options
    const link: ClientLink<Record<never, never>> = {
      call: (path, input, callOptions) => this.call(path, input, callOptions)
    }
    this.client = createORPCClient<RuntimeOrpcClient>(link)
    this.subscriptions = new MobileRuntimeOrpcSubscriptions({
      resolveConnection: async (signal) => {
        await abortable(this.options.waitForConnected(signal), signal)
        return { generation: this.generation, link: this.link }
      },
      shouldReplay: (generation, signal) => this.shouldReplay(generation, signal),
      waitForReplay: (generation, signal) => this.waitForReplay(generation, signal),
      registerTerminalStream: options.registerTerminalStream,
      isClosed: () => this.isClosed
    })
  }

  connected(): void {
    this.channel?.close()
    this.generation++
    this.channel = new MobileRuntimeOrpcChannel({
      sendText: this.options.sendText,
      sendBinary: this.options.sendBinary
    })
    this.link = new RPCLink({
      port: this.channel,
      headers: () => ({ [RUNTIME_ORPC_REQUEST_ID_HEADER]: this.options.nextRequestId() })
    })
    this.notifyChange()
  }

  disconnected(): void {
    this.channel?.close()
    this.channel = null
    this.link = null
    this.subscriptions.disconnected()
    this.notifyChange()
  }

  close(): void {
    this.isClosed = true
    this.subscriptions.close()
    this.disconnected()
  }

  receiveText(frame: string): boolean {
    return this.channel?.receiveText(frame) ?? false
  }

  receiveBinary(frame: Uint8Array<ArrayBufferLike>): boolean {
    return this.channel?.receiveBinary(frame) ?? false
  }

  handleBrowserBinaryFrame(frame: BrowserScreencastFrame): boolean {
    return this.subscriptions.handleBrowserBinaryFrame(frame)
  }

  cancelBrowserStream(): void {
    this.subscriptions.cancelBrowserStream()
  }

  private async call(
    path: readonly string[],
    input: unknown,
    options: { signal?: AbortSignal }
  ): Promise<unknown> {
    if (isRuntimeOrpcStreamPath(path)) {
      return this.subscriptions.create(path, input, options.signal)
    }
    await abortable(this.options.waitForConnected(options.signal), options.signal)
    const link = this.link
    const generation = this.generation
    if (!link) {
      throw new Error('The mobile oRPC connection is unavailable')
    }
    try {
      return await link.call(path, input, { context: {}, signal: options.signal })
    } catch (error) {
      await Promise.resolve()
      if (
        !(error instanceof ORPCError) &&
        (generation !== this.generation || this.options.getState() !== 'connected')
      ) {
        throw deliveryUnknownError(error)
      }
      if (!(error instanceof ORPCError) && options.signal?.aborted) {
        throw deliveryUnknownError(error)
      }
      throw error
    }
  }

  private shouldReplay(generation: number, signal: AbortSignal): boolean {
    return (
      !signal.aborted &&
      !this.isClosed &&
      (generation !== this.generation || this.options.getState() !== 'connected')
    )
  }

  private async waitForReplay(generation: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted && !this.isClosed) {
      if (this.options.getState() === 'connected' && generation !== this.generation) {
        return
      }
      await this.waitForChange(signal)
    }
  }

  private waitForChange(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        signal.removeEventListener('abort', finish)
        this.changeListeners.delete(finish)
        resolve()
      }
      this.changeListeners.add(finish)
      signal.addEventListener('abort', finish, { once: true })
    })
  }

  private notifyChange(): void {
    for (const listener of Array.from(this.changeListeners)) {
      listener()
    }
  }
}

function deliveryUnknownError(error: unknown): Error {
  return markRpcDeliveryUnknown(error instanceof Error ? error : new Error(String(error)))
}

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('Runtime oRPC request aborted'))
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => finish(() => reject(signal.reason))
    const finish = (complete: () => void): void => {
      signal.removeEventListener('abort', onAbort)
      complete()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    )
  })
}
