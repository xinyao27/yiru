import { ORPCError } from '@orpc/client'
import {
  REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY,
  RUNTIME_ORPC_RUNTIME_CAPABILITY
} from '@yiru/runtime-protocol/capabilities'
import {
  RUNTIME_ORPC_CONNECT_PORT_MESSAGE,
  type RuntimeOrpcConnectPortRequest
} from '~shared/runtime-orpc-message-port'
import { withBrowserPaneUiRuntimeRpcSource } from '~shared/runtime-rpc-feature-interaction-source'

import { createRuntimeRpcAbortError } from './abortable-runtime-environment-call'
import {
  ensureRuntimeEnvironmentCompatible,
  runtimeEnvironmentSupportsCapability
} from './environment-compatibility'
import {
  retainRuntimeOrpcBinaryRoute,
  type RuntimeOrpcBinaryListener
} from './orpc-binary-side-channel'
import {
  acquireEnvironmentRuntimeOrpcClient,
  RuntimeOrpcBootstrapError
} from './orpc-environment-client'
import { createLegacyRuntimeOrpcClient } from './orpc-legacy-client'
import {
  createRuntimeOrpcMessagePortConnection,
  type RuntimeOrpcClient,
  type RuntimeOrpcClientConnection,
  type RuntimeOrpcClientContext
} from './orpc-message-port-client'
import { createWebEnvironmentRuntimeOrpcClient } from './orpc-web-environment-client'
import { RuntimeRpcCallError } from './rpc-response'
import { mountShellServicesHandler } from './shell-services-handler'

const DEFAULT_ENVIRONMENT_TIMEOUT_MS = 15_000

export type RuntimeClientTarget = { kind: 'local' } | { kind: 'environment'; environmentId: string }

export type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-message-port-client'

export type RuntimeOrpcCallOptions = {
  timeoutMs?: number
  suppressFeatureInteraction?: boolean
  reuseRecentCompatibilityFailure?: boolean
  signal?: AbortSignal
  // Why: the only two real binary-emitting leaves (`browser.screencast`,
  // `terminal.multiplex`) push frames out-of-band from the event-iterator
  // values themselves, over the request-scoped side channel each transport
  // registers by request id (see `orpc-binary-side-channel.ts`).
  onBinary?: RuntimeOrpcBinaryListener
}

type RuntimeOrpcProcedure<TInput, TResult> = (
  input: TInput,
  options?: { signal?: AbortSignal; context?: RuntimeOrpcClientContext }
) => Promise<TResult>

export function isRuntimeOrpcErrorCode(error: unknown, code: string): boolean {
  if (error instanceof RuntimeRpcCallError) {
    return error.code === code
  }
  if (!(error instanceof ORPCError)) {
    return false
  }
  const actualCode = error.code.toLowerCase()
  if (actualCode === code.toLowerCase()) {
    return true
  }
  return actualCode === 'not_found' && code === 'method_not_found'
}

export async function callRuntimeOrpc<TInput, TResult>(
  target: RuntimeClientTarget,
  selectProcedure: (client: RuntimeOrpcClient) => RuntimeOrpcProcedure<TInput, TResult>,
  input: TInput,
  options: RuntimeOrpcCallOptions = {}
): Promise<TResult> {
  const connection = await createRuntimeOrpcClient(target, options)
  const callSignal = createRuntimeOrpcCallSignal(target, options)
  const release = (): void => {
    callSignal.close()
    connection.close()
  }
  try {
    const procedure = selectProcedure(connection.client)
    const nextInput = featureInteractionInput(input, options.suppressFeatureInteraction === true)
    const result = await procedure(nextInput, {
      signal: callSignal.signal,
      context: { onBinary: options.onBinary }
    })
    // Why: a unary result releases immediately, same as before this helper
    // learned to carry event-iterator leaves. A streaming result (only
    // `browser.screencast.subscribe` today) must keep the connection and the
    // binary side-channel registration alive until the iterator itself is
    // drained or aborted — releasing here would sever the transport before
    // the caller ever reads a frame.
    return retainRuntimeOrpcBinaryRoute(result, release) as TResult
  } catch (error) {
    release()
    throw error
  }
}

export async function createRuntimeOrpcClient(
  target: RuntimeClientTarget,
  options: Pick<
    RuntimeOrpcCallOptions,
    'timeoutMs' | 'reuseRecentCompatibilityFailure' | 'signal'
  > = {}
): Promise<RuntimeOrpcClientConnection> {
  if (target.kind === 'local') {
    return createLocalRuntimeOrpcClient()
  }
  const environmentId = target.environmentId.trim()
  const environmentTarget = { kind: 'environment', environmentId } as const
  await abortable(ensureRuntimeEnvironmentCompatible(environmentId, options), options.signal)
  if (isWebRuntimeClient()) {
    // Why: the web renderer has no Electron preload to accept a MessagePort,
    // so it cannot reuse `acquireEnvironmentRuntimeOrpcClient` below — but it
    // does not need to. `WebRuntimeClient` already terminates an encrypted
    // oRPC peer for the paired host (falling back to its own legacy JSON-RPC
    // wrapper when that host doesn't advertise oRPC support); dispatching
    // through it inherits that negotiation instead of going straight to the
    // legacy dispatcher unconditionally.
    return createWebEnvironmentRuntimeOrpcClient(environmentTarget, options)
  }
  const supportsOrpc = await abortable(
    runtimeEnvironmentSupportsCapability(
      environmentId,
      RUNTIME_ORPC_RUNTIME_CAPABILITY,
      options.timeoutMs
    ),
    options.signal
  )
  const supportsSharedControl =
    supportsOrpc &&
    (await abortable(
      runtimeEnvironmentSupportsCapability(
        environmentId,
        REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY,
        options.timeoutMs
      ),
      options.signal
    ))
  if (!supportsSharedControl) {
    return createLegacyRuntimeOrpcClient(environmentTarget, options)
  }
  try {
    return await acquireEnvironmentRuntimeOrpcClient(environmentId, {
      timeoutMs: options.timeoutMs ?? DEFAULT_ENVIRONMENT_TIMEOUT_MS,
      signal: options.signal
    })
  } catch (error) {
    if (error instanceof RuntimeOrpcBootstrapError && error.code === 'unsupported') {
      return createLegacyRuntimeOrpcClient(environmentTarget, options)
    }
    throw error
  }
}

export function isWebRuntimeClient(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

// Why: a few call sites (e.g. the remote terminal pty transport) still address
// a runtime procedure by a dot-joined method string instead of a statically
// known contract path. Walk the negotiated client the same way the web shim's
// `callOrpcProcedure` does, instead of each of those call sites hand-rolling
// its own dispatcher that reaches for `window.api.runtimeEnvironments.call`
// directly — that bare-string channel skips capability negotiation entirely
// (see docs/runtime-orpc-migration.md Phase 6 D-stage).
export async function callRuntimeOrpcByPath<TResult = unknown>(
  target: RuntimeClientTarget,
  path: readonly string[],
  input: unknown,
  options: RuntimeOrpcCallOptions = {}
): Promise<TResult> {
  return callRuntimeOrpc<unknown, TResult>(
    target,
    (client) => resolveRuntimeOrpcProcedureByPath<TResult>(client, path),
    input,
    options
  )
}

function resolveRuntimeOrpcProcedureByPath<TResult>(
  client: RuntimeOrpcClient,
  path: readonly string[]
): RuntimeOrpcProcedure<unknown, TResult> {
  let node: unknown = client
  for (const segment of path) {
    node = (node as Record<string, unknown>)[segment]
  }
  return node as RuntimeOrpcProcedure<unknown, TResult>
}

// Why: the local target is one long-lived in-process peer, so it gets one
// MessagePort for the renderer's lifetime. Opening a channel per call made main
// stand up a fresh oRPC handler for every request — at startup that churn spiked
// the renderer past 3 GB and tripped V8's heap limit. Callers still get a
// connection whose `close()` is a no-op, so ownership semantics are unchanged.
let pooledLocalConnection: RuntimeOrpcClientConnection | null = null

function openLocalRuntimeOrpcConnection(): RuntimeOrpcClientConnection {
  // Why: must be mounted before the connect request goes out — main hands
  // back the shell-services port over the same handshake, and Phase 5's
  // reverse contract needs a listener already registered to receive it.
  mountShellServicesHandler()
  const channel = new MessageChannel()
  const connection = createRuntimeOrpcMessagePortConnection(channel.port1)
  const request = {
    type: RUNTIME_ORPC_CONNECT_PORT_MESSAGE,
    target: { kind: 'local' }
  } satisfies RuntimeOrpcConnectPortRequest
  channel.port1.start()
  window.postMessage(request, '*', [channel.port2])
  return connection
}

export function createLocalRuntimeOrpcClient(): RuntimeOrpcClientConnection {
  if (isWebRuntimeClient()) {
    return createWebEnvironmentRuntimeOrpcClient(
      { kind: 'environment', environmentId: 'active' },
      {}
    )
  }
  const existing = pooledLocalConnection
  if (existing) {
    return existing
  }
  const opened = openLocalRuntimeOrpcConnection()
  const shared: RuntimeOrpcClientConnection = {
    client: opened.client,
    transport: opened.transport,
    close: () => {}
  }
  pooledLocalConnection = shared
  return shared
}

function createRuntimeOrpcCallSignal(
  target: RuntimeClientTarget,
  options: Pick<RuntimeOrpcCallOptions, 'signal' | 'timeoutMs'>
): { signal?: AbortSignal; close: () => void } {
  const timeoutMs =
    options.timeoutMs ??
    (target.kind === 'environment' ? DEFAULT_ENVIRONMENT_TIMEOUT_MS : undefined)
  if (timeoutMs === undefined) {
    return { signal: options.signal, close: () => {} }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    const error = new Error('Runtime oRPC request timed out.')
    error.name = 'TimeoutError'
    controller.abort(error)
  }, timeoutMs)
  const onAbort = (): void =>
    controller.abort(options.signal?.reason ?? createRuntimeRpcAbortError())
  if (options.signal?.aborted) {
    onAbort()
  } else {
    options.signal?.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    close: () => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }
}

function featureInteractionInput<TInput>(
  input: TInput,
  suppressFeatureInteraction: boolean
): TInput {
  if (!suppressFeatureInteraction) {
    return input
  }
  // Why: the feature-interaction marker adds metadata without changing a
  // procedure's declared input shape.
  return withBrowserPaneUiRuntimeRpcSource(input) as TInput
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
