import { ORPCError } from '@orpc/client'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { STATUS_GET_CONTRACT } from '@yiru/runtime-protocol/status'
import type { RuntimeStatus } from '~shared/runtime-types'

import type { RuntimeEnvironmentApi } from '../runtime/runtime-environment-api'
import {
  isLegacyBackgroundRuntimeMethod,
  type WebRuntimeOrpcClient,
  type WebRuntimeOrpcClientContext
} from './legacy-orpc-link'
import { WebRuntimeCallQueuePool, type WebRuntimeCallPriority } from './runtime-call-queue'
import { WebRuntimeClient } from './runtime-client'
import {
  clearStoredWebRuntimeEnvironment,
  getPreferredWebPairingOffer,
  readStoredWebRuntimeEnvironment,
  redactStoredWebRuntimeEnvironment,
  updateStoredEnvironmentRuntimeId,
  type StoredWebRuntimeEnvironment
} from './runtime-environment'

type WebRuntimeProcedure<TResult> = (
  client: WebRuntimeOrpcClient,
  options: { signal: AbortSignal }
) => Promise<TResult>

type WebRuntimeProcedureOptions = {
  environment?: StoredWebRuntimeEnvironment
  priority?: WebRuntimeCallPriority
  signal?: AbortSignal
  timeoutMs?: number
}

let activeEnvironment: StoredWebRuntimeEnvironment | null = null
let activeClient: WebRuntimeClient | null = null
let activeClientEnvironmentId: string | null = null
const runtimeCallQueuePool = new WebRuntimeCallQueuePool()

export function initializeWebRuntimeConnection(): void {
  activeEnvironment = readStoredWebRuntimeEnvironment()
}

export function getWebActiveEnvironment(): StoredWebRuntimeEnvironment | null {
  activeEnvironment = activeEnvironment ?? readStoredWebRuntimeEnvironment()
  return activeEnvironment
}

export function requireWebActiveEnvironment(): StoredWebRuntimeEnvironment {
  const environment = getWebActiveEnvironment()
  if (!environment) {
    throw new Error('Connect this web client to a runtime host first.')
  }
  return environment
}

export function disconnectActiveWebRuntimeEnvironment(): void {
  const environment = getWebActiveEnvironment()
  if (environment) {
    disconnectEnvironment(environment)
  }
}

export async function callWebRuntimeProcedure<TResult>(
  procedure: WebRuntimeProcedure<TResult>,
  options: WebRuntimeProcedureOptions = {}
): Promise<TResult> {
  const environment = options.environment ?? requireWebActiveEnvironment()
  const timeoutMs = options.timeoutMs ?? 30_000
  return runtimeCallQueuePool.enqueue(
    environment.id,
    options.priority ?? 'foreground',
    async () => {
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal
      const client = await getClientForEnvironment(environment).getOrpcClient(timeoutMs, signal)
      return procedure(client, { signal })
    }
  )
}

export function getWebRuntimeEnvironmentApi(): RuntimeEnvironmentApi {
  return {
    list: async () => {
      const environment = getWebActiveEnvironment()
      return environment ? [redactStoredWebRuntimeEnvironment(environment)] : []
    },
    resolve: async ({ selector }) =>
      redactStoredWebRuntimeEnvironment(resolveEnvironment(selector)),
    remove: async ({ selector }) => {
      const environment = resolveEnvironment(selector)
      disconnectEnvironment(environment)
      return { removed: redactStoredWebRuntimeEnvironment(environment) }
    },
    disconnect: async ({ selector }) => {
      const environment = resolveEnvironment(selector)
      disconnectEnvironment(environment)
      return { disconnected: redactStoredWebRuntimeEnvironment(environment) }
    },
    getStatus: ({ selector, timeoutMs }) => getEnvironmentStatusEnvelope(selector, timeoutMs),
    call: ({ selector, method, params, timeoutMs }) => {
      const environment = resolveEnvironment(selector)
      return method === STATUS_GET_CONTRACT.name
        ? getEnvironmentStatusEnvelope(environment.id, timeoutMs)
        : callLegacyEnvironmentEnvelope(environment, method, params, timeoutMs)
    },
    subscribe: async ({ selector, method, params, timeoutMs }, callbacks) =>
      getClientForEnvironment(resolveEnvironment(selector)).subscribe(method, params, callbacks, {
        timeoutMs
      }),
    callOrpcProcedure: async ({ selector, path, input, timeoutMs }, options) => {
      const client = await getClientForEnvironment(resolveEnvironment(selector)).getOrpcClient(
        timeoutMs,
        options?.signal
      )
      return resolveOrpcClientProcedure(client, path)(input, {
        signal: options?.signal,
        context: { onBinary: options?.onBinary }
      })
    }
  }
}

function resolveOrpcClientProcedure(
  client: WebRuntimeOrpcClient,
  path: readonly string[]
): (
  input: unknown,
  options?: { signal?: AbortSignal; context?: WebRuntimeOrpcClientContext }
) => Promise<unknown> {
  let node: unknown = client
  for (const segment of path) {
    node = (node as Record<string, unknown>)[segment]
  }
  return node as (
    input: unknown,
    options?: { signal?: AbortSignal; context?: WebRuntimeOrpcClientContext }
  ) => Promise<unknown>
}

async function callLegacyEnvironmentEnvelope<TResult = unknown>(
  environment: StoredWebRuntimeEnvironment,
  method: string,
  params?: unknown,
  timeoutMs?: number
): Promise<RuntimeRpcResponse<TResult>> {
  const priority = isLegacyBackgroundRuntimeMethod(method) ? 'background' : 'foreground'
  const response = await runtimeCallQueuePool.enqueue(environment.id, priority, () =>
    getClientForEnvironment(environment).call(method, params, { timeoutMs })
  )
  updateEnvironmentFromResponse(environment, response)
  return response as RuntimeRpcResponse<TResult>
}

async function getEnvironmentStatusEnvelope(
  selector: string,
  timeoutMs = 15_000
): Promise<RuntimeRpcResponse<RuntimeStatus>> {
  const environment = resolveEnvironment(selector)
  const id = `web-orpc-${crypto.randomUUID()}`
  try {
    const result = await callWebRuntimeProcedure(
      (client, options) => client.status.get(undefined, options),
      { environment, timeoutMs }
    )
    activeEnvironment = updateStoredEnvironmentRuntimeId(environment, result.runtimeId)
    return { id, ok: true, result, _meta: { runtimeId: result.runtimeId } }
  } catch (error) {
    return {
      id,
      ok: false,
      error: {
        code: error instanceof ORPCError ? error.code : 'internal_error',
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof ORPCError && error.data !== undefined ? { data: error.data } : {})
      },
      _meta: { runtimeId: environment.runtimeId }
    }
  }
}

function getClientForEnvironment(environment: StoredWebRuntimeEnvironment): WebRuntimeClient {
  if (!activeClient || activeClientEnvironmentId !== environment.id) {
    activeClient?.close()
    activeClient = new WebRuntimeClient(getPreferredWebPairingOffer(environment), (runtimeId) => {
      activeEnvironment = updateStoredEnvironmentRuntimeId(environment, runtimeId)
    })
    activeClientEnvironmentId = environment.id
  }
  return activeClient
}

function disconnectEnvironment(environment: StoredWebRuntimeEnvironment): void {
  if (getWebActiveEnvironment()?.id !== environment.id) {
    return
  }
  activeClient?.close()
  activeClient = null
  activeClientEnvironmentId = null
  clearStoredWebRuntimeEnvironment()
  activeEnvironment = null
}

function resolveEnvironment(selector: string): StoredWebRuntimeEnvironment {
  const environment = requireWebActiveEnvironment()
  if (
    selector === environment.id ||
    selector === environment.name ||
    selector === 'active' ||
    (selector.startsWith('web-') && environment.id.startsWith('web-'))
  ) {
    return environment
  }
  throw new Error(`Unknown Yiru runtime environment: ${selector}`)
}

function updateEnvironmentFromResponse(
  environment: StoredWebRuntimeEnvironment,
  response: RuntimeRpcResponse<unknown>
): void {
  const runtimeId = response.ok ? response._meta.runtimeId : (response._meta?.runtimeId ?? null)
  activeEnvironment = updateStoredEnvironmentRuntimeId(environment, runtimeId)
}
