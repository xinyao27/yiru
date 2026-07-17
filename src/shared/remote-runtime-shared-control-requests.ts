import { randomUUID } from 'node:crypto'
import type { RemoteRuntimeClientError } from './remote-runtime-client-error'
import {
  remoteRuntimeTimeoutError,
  remoteRuntimeUnavailableError
} from './remote-runtime-request-frames'
import type { RuntimeRpcResponse } from './runtime-rpc-envelope'
import { toRemoteRuntimeClientError } from './remote-runtime-shared-control-protocol'
import { rejectSharedControlPendingRequest } from './remote-runtime-shared-control-state'
import type { SharedControlPendingRequest } from './remote-runtime-shared-control-types'

export function requestSharedControl<TResult>(args: {
  pendingRequests: Map<string, SharedControlPendingRequest<unknown>>
  method: string
  params: unknown
  timeoutMs: number
  ensureReady: () => Promise<void>
  beforeSend?: () => void | Promise<void>
  signal?: AbortSignal
  send: (requestId: string, method: string, params: unknown) => void
  cancel?: (requestId: string) => void
  onTimeout?: (error: RemoteRuntimeClientError) => void
  // Why: default off — ordinary short RPCs keep an absolute deadline. Only
  // long-polls routed through this path opt in so keepalives extend them.
  refreshTimeoutOnKeepalive?: boolean
}): Promise<RuntimeRpcResponse<TResult>> {
  args.signal?.throwIfAborted()
  const requestId = randomUUID()
  return new Promise<RuntimeRpcResponse<TResult>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const pending = args.pendingRequests.get(requestId)
      if (!pending) {
        return
      }
      const timeoutError = remoteRuntimeTimeoutError()
      if (pending.sent) {
        args.cancel?.(requestId)
      }
      rejectSharedControlPendingRequest(args.pendingRequests, requestId, timeoutError)
      // Why: a request the server never answered means the socket is suspect
      // (half-open tunnels swallow frames silently); mirror
      // RemoteRuntimeRequestConnection and hand the connection a teardown
      // error so reconnect+replay runs instead of keeping a zombie socket.
      args.onTimeout?.(
        remoteRuntimeUnavailableError(
          'Remote Yiru runtime did not answer in time; resetting the control connection.'
        )
      )
    }, args.timeoutMs)
    const abortListener = (): void => {
      const pending = args.pendingRequests.get(requestId)
      if (pending?.sent) {
        args.cancel?.(requestId)
      }
      const reason = args.signal?.reason
      rejectSharedControlPendingRequest(
        args.pendingRequests,
        requestId,
        reason instanceof Error
          ? reason
          : remoteRuntimeUnavailableError('Remote request cancelled.')
      )
    }
    args.pendingRequests.set(requestId, {
      method: args.method,
      resolve: resolve as (response: RuntimeRpcResponse<unknown>) => void,
      reject,
      timeout,
      signal: args.signal,
      abortListener,
      sent: false,
      refreshTimeoutOnKeepalive: args.refreshTimeoutOnKeepalive ?? false
    })
    args.signal?.addEventListener('abort', abortListener, { once: true })
    if (args.signal?.aborted) {
      abortListener()
    }
    void args.ensureReady().then(
      async () => {
        try {
          // Why: queued Spool mutations must revalidate after connection setup, at transmission.
          await args.beforeSend?.()
          args.signal?.throwIfAborted()
          const pending = args.pendingRequests.get(requestId)
          if (pending) {
            pending.sent = true
          }
          args.send(requestId, args.method, args.params)
        } catch (error) {
          rejectSharedControlPendingRequest(
            args.pendingRequests,
            requestId,
            error instanceof Error ? error : toRemoteRuntimeClientError(error)
          )
        }
      },
      (error) =>
        rejectSharedControlPendingRequest(
          args.pendingRequests,
          requestId,
          toRemoteRuntimeClientError(error)
        )
    )
  })
}
