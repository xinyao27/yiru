import {
  RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER,
  RUNTIME_ORPC_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'
import { RemoteRuntimeClientError } from '@yiru/runtime-protocol/workbench/remote-runtime/client-error'

import type { RemoteRuntimeSubscriptionSession } from './subscription-session'

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}

function invalidDedicatedOrpcFrame(): RemoteRuntimeClientError {
  return new RemoteRuntimeClientError(
    'invalid_runtime_response',
    'Runtime host returned an invalid dedicated oRPC frame.'
  )
}

function dedicatedOrpcError(error: unknown): RemoteRuntimeClientError {
  if (error instanceof RemoteRuntimeClientError) {
    return error
  }
  if (isOrpcError(error)) {
    return new RemoteRuntimeClientError(error.code, error.message)
  }
  return new RemoteRuntimeClientError(
    'remote_runtime_unavailable',
    error instanceof Error ? error.message : 'Dedicated runtime stream failed.'
  )
}

function isOrpcError(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

export async function startDedicatedOrpcSubscription<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  runtimeId: string
): Promise<void> {
  const peer = session.dedicatedOrpcPeer
  if (!peer) {
    session.fail(invalidDedicatedOrpcFrame())
    return
  }
  try {
    const { RPCLink } = await import('@orpc/client/websocket')
    const link = new RPCLink<Record<never, never>>({
      websocket: peer,
      headers: {
        [RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER]: '1',
        [RUNTIME_ORPC_REQUEST_ID_HEADER]: session.requestId
      }
    })
    // Why: terminal.multiplex does not yield its first event until the caller
    // answers the binary epoch offer. Expose sendBinary before awaiting call().
    session.succeed()
    const output = await link.call(session.method.split('.'), session.params, {
      context: {},
      signal: session.streamAbort.signal
    })
    if (!isAsyncIterable(output)) {
      session.fail(invalidDedicatedOrpcFrame())
      return
    }
    void consumeDedicatedOrpcSubscription(session, output, runtimeId)
  } catch (error) {
    if (!session.streamAbort.signal.aborted && !session.isSocketClosed) {
      session.fail(dedicatedOrpcError(error))
    }
  }
}

async function consumeDedicatedOrpcSubscription<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  output: AsyncIterable<unknown>,
  runtimeId: string
): Promise<void> {
  try {
    for await (const result of output) {
      session.callbacks.onResponse({
        id: session.requestId,
        ok: true,
        result: result as TResult,
        _meta: { runtimeId }
      })
    }
    session.closeSocketAfterCleanup()
    session.notifyClose()
  } catch (error) {
    if (!session.streamAbort.signal.aborted && !session.isSocketClosed) {
      session.fail(dedicatedOrpcError(error))
    }
  }
}

export function rejectInvalidDedicatedOrpcFrame<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>
): void {
  session.fail(invalidDedicatedOrpcFrame())
}
