import { ORPCError } from '@orpc/client'
import { withBrowserPaneUiRuntimeRpcSource } from '~shared/runtime-rpc-feature-interaction-source'

import { createRuntimeRpcAbortError } from './abortable-runtime-environment-call'
import { ensureRuntimeEnvironmentCompatible } from './environment-compatibility'
import {
  retainRuntimeOrpcBinaryRoute,
  type RuntimeOrpcBinaryListener
} from './orpc-binary-side-channel'
import type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-connection'
import { openRuntimeLoopbackOrpcConnection } from './orpc-loopback-client'
import { createWebEnvironmentRuntimeOrpcClient } from './orpc-web-environment-client'
import { RuntimeRpcCallError } from './rpc-response'

const DEFAULT_ENVIRONMENT_TIMEOUT_MS = 15_000

export type RuntimeClientTarget = { kind: 'local' } | { kind: 'environment'; environmentId: string }

export type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-connection'

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

// Why: shell procedures always address the OS host rendering this window.
// They must never follow the selected runtime environment, which could point
// at WSL, SSH, or a relay-connected machine with a different window/clipboard.
export function callShellOrpc<TInput, TResult>(
  selectProcedure: (client: RuntimeOrpcClient) => RuntimeOrpcProcedure<TInput, TResult>,
  input: TInput,
  options: RuntimeOrpcCallOptions = {}
): Promise<TResult> {
  if (isWebRuntimeClient()) {
    return Promise.reject(new ORPCError('unavailable_on_host', { status: 501 }))
  }
  return callRuntimeOrpc({ kind: 'local' }, selectProcedure, input, options)
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
  if (isWebRuntimeClient()) {
    // Why: the web renderer has no Electron preload to accept a MessagePort,
    // so it cannot reuse `acquireEnvironmentRuntimeOrpcClient` below — but it
    // does not need to. `WebRuntimeClient` already terminates an encrypted
    // oRPC peer for the paired host (falling back to its own legacy JSON-RPC
    // wrapper when that host doesn't advertise oRPC support); dispatching
    // through it inherits that negotiation instead of going straight to the
    // legacy dispatcher unconditionally.
    await abortable(ensureRuntimeEnvironmentCompatible(environmentId, options), options.signal)
    return createWebEnvironmentRuntimeOrpcClient(environmentTarget, options)
  }
  return openRuntimeLoopbackOrpcConnection(
    {
      kind: 'environment',
      environmentId,
      timeoutMs: options.timeoutMs ?? DEFAULT_ENVIRONMENT_TIMEOUT_MS
    },
    options
  )
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

// Why: the local target is one long-lived loopback peer for the renderer's
// lifetime. Opening a socket per call made main
// stand up a fresh oRPC handler for every request — at startup that churn spiked
// the renderer past 3 GB and tripped V8's heap limit. Callers still get a
// connection whose `close()` is a no-op, so ownership semantics are unchanged.
let pooledLocalConnection: Promise<RuntimeOrpcClientConnection> | null = null

export function createLocalRuntimeOrpcClient(): Promise<RuntimeOrpcClientConnection> {
  if (isWebRuntimeClient()) {
    return Promise.resolve(
      createWebEnvironmentRuntimeOrpcClient({ kind: 'environment', environmentId: 'active' }, {})
    )
  }
  const existing = pooledLocalConnection
  if (existing) {
    return existing
  }
  let pending: Promise<RuntimeOrpcClientConnection>
  pending = openRuntimeLoopbackOrpcConnection(
    { kind: 'local' },
    {
      onClose: () => {
        if (pooledLocalConnection === pending) {
          pooledLocalConnection = null
        }
      }
    }
  ).then((opened) => ({ client: opened.client, transport: opened.transport, close: () => {} }))
  pooledLocalConnection = pending
  void pending.catch(() => {
    if (pooledLocalConnection === pending) {
      pooledLocalConnection = null
    }
  })
  return pending
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
