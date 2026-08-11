import {
  parseRuntimeOrpcPortBootstrapMessage,
  RUNTIME_ORPC_CONNECT_PORT_MESSAGE,
  RUNTIME_ORPC_PORT_ERROR_MESSAGE,
  RUNTIME_ORPC_PORT_READY_MESSAGE,
  type RuntimeOrpcConnectPortRequest
} from '~shared/runtime-orpc-message-port'

import { createRuntimeRpcAbortError } from './abortable-runtime-environment-call'
import type { RuntimeOrpcClientConnection } from './orpc-message-port-client'
import { createRuntimeOrpcMessagePortConnection } from './orpc-message-port-client'

type SharedEnvironmentClient = {
  client: RuntimeOrpcClientConnection['client']
  port: MessagePort
  refCount: number
  isClosed: boolean
  hasInvalidationListener: boolean
}

type PendingEnvironmentClient = {
  promise: Promise<SharedEnvironmentClient>
  waiters: number
}

const environmentClients = new Map<string, PendingEnvironmentClient>()

export async function acquireEnvironmentRuntimeOrpcClient(
  environmentId: string,
  options: { timeoutMs: number; signal?: AbortSignal }
): Promise<RuntimeOrpcClientConnection> {
  let pending = environmentClients.get(environmentId)
  if (!pending) {
    const promise = createEnvironmentMessagePortClient(environmentId, options.timeoutMs)
    pending = { promise, waiters: 0 }
    environmentClients.set(environmentId, pending)
    void promise.catch(() => {
      if (environmentClients.get(environmentId) === pending) {
        environmentClients.delete(environmentId)
      }
    })
  }
  pending.waiters += 1
  let acquired = false
  try {
    const entry = await abortable(pending.promise, options.signal)
    if (entry.isClosed) {
      if (environmentClients.get(environmentId) === pending) {
        environmentClients.delete(environmentId)
      }
      return acquireEnvironmentRuntimeOrpcClient(environmentId, options)
    }
    if (!entry.hasInvalidationListener) {
      entry.hasInvalidationListener = true
      entry.port.addEventListener('close', () => {
        entry.isClosed = true
        if (environmentClients.get(environmentId) === pending) {
          environmentClients.delete(environmentId)
        }
      })
    }
    entry.refCount += 1
    acquired = true
    let released = false
    return {
      client: entry.client,
      transport: 'message-port',
      close: () => {
        if (released) {
          return
        }
        released = true
        entry.refCount -= 1
        if (entry.refCount === 0) {
          if (environmentClients.get(environmentId) === pending) {
            environmentClients.delete(environmentId)
          }
          closeMessagePortEntry(entry)
        }
      }
    }
  } finally {
    pending.waiters -= 1
    if (!acquired) {
      closePendingEnvironmentClientWhenUnused(environmentId, pending)
    }
  }
}

async function createEnvironmentMessagePortClient(
  environmentId: string,
  timeoutMs: number
): Promise<SharedEnvironmentClient> {
  const channel = new MessageChannel()
  let entry: SharedEnvironmentClient | null = null
  let isClosed = false
  channel.port1.addEventListener('close', () => {
    isClosed = true
    if (entry) {
      entry.isClosed = true
    }
  })
  channel.port1.start()
  const bootstrap = waitForEnvironmentBootstrap(channel.port1, timeoutMs)
  const request = {
    type: RUNTIME_ORPC_CONNECT_PORT_MESSAGE,
    target: { kind: 'environment', environmentId, timeoutMs }
  } satisfies RuntimeOrpcConnectPortRequest
  window.postMessage(request, '*', [channel.port2])
  try {
    await bootstrap
    const connection = createRuntimeOrpcMessagePortConnection(channel.port1)
    entry = {
      client: connection.client,
      port: channel.port1,
      refCount: 0,
      isClosed,
      hasInvalidationListener: false
    }
    if (isClosed) {
      channel.port1.dispatchEvent(new Event('close'))
      throw new Error('Runtime oRPC tunnel closed during bootstrap.')
    }
    return entry
  } catch (error) {
    channel.port1.close()
    throw error
  }
}

function waitForEnvironmentBootstrap(port: MessagePort, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(() => reject(new Error('Runtime oRPC tunnel connection timed out.'))),
      timeoutMs
    )
    const finish = (complete: () => void): void => {
      clearTimeout(timeout)
      port.removeEventListener('message', onMessage)
      port.removeEventListener('close', onClose)
      complete()
    }
    const onMessage = (event: MessageEvent<unknown>): void => {
      const message = parseRuntimeOrpcPortBootstrapMessage(event.data)
      if (message?.type === RUNTIME_ORPC_PORT_READY_MESSAGE) {
        finish(resolve)
      } else if (message?.type === RUNTIME_ORPC_PORT_ERROR_MESSAGE) {
        finish(() => reject(new RuntimeOrpcBootstrapError(message.code, message.message)))
      }
    }
    const onClose = (): void =>
      finish(() => reject(new Error('Runtime oRPC tunnel closed before connecting.')))
    port.addEventListener('message', onMessage)
    port.addEventListener('close', onClose, { once: true })
  })
}

function closePendingEnvironmentClientWhenUnused(
  environmentId: string,
  pending: PendingEnvironmentClient
): void {
  void pending.promise.then(
    (entry) => {
      if (
        environmentClients.get(environmentId) === pending &&
        pending.waiters === 0 &&
        entry.refCount === 0
      ) {
        environmentClients.delete(environmentId)
        closeMessagePortEntry(entry)
      }
    },
    () => {}
  )
}

function abortable<TResult>(promise: Promise<TResult>, signal?: AbortSignal): Promise<TResult> {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(createRuntimeRpcAbortError())
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => finish(() => reject(createRuntimeRpcAbortError()))
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

function closeMessagePortEntry(entry: SharedEnvironmentClient): void {
  if (entry.isClosed) {
    return
  }
  entry.isClosed = true
  entry.port.dispatchEvent(new Event('close'))
  entry.port.close()
}

export class RuntimeOrpcBootstrapError extends Error {
  readonly code: 'unsupported' | 'unavailable'

  constructor(code: 'unsupported' | 'unavailable', message: string) {
    super(message)
    this.name = 'RuntimeOrpcBootstrapError'
    this.code = code
  }
}
