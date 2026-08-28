import type { ShellRuntimeEnvironmentOrpcStreamEvent } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type { PublicKnownRuntimeEnvironment } from '@yiru/runtime-protocol/workbench/runtime-environments'
import type { RuntimeStatus } from '@yiru/runtime-protocol/workbench/runtime-types'

export type RuntimeEnvironmentSubscriptionHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}

export type RuntimeEnvironmentApi = {
  list: () => Promise<PublicKnownRuntimeEnvironment[]>
  resolve: (args: { selector: string }) => Promise<PublicKnownRuntimeEnvironment>
  remove: (args: { selector: string }) => Promise<{ removed: PublicKnownRuntimeEnvironment }>
  disconnect: (args: {
    selector: string
  }) => Promise<{ disconnected: PublicKnownRuntimeEnvironment }>
  getStatus: (args: {
    selector: string
    timeoutMs?: number
  }) => Promise<RuntimeRpcResponse<RuntimeStatus>>
  call: (args: {
    selector: string
    method: string
    params?: unknown
    timeoutMs?: number
  }) => Promise<RuntimeRpcResponse<unknown>>
  subscribe: (
    args: {
      selector: string
      method: string
      params?: unknown
      timeoutMs?: number
    },
    callbacks: {
      onResponse: (response: RuntimeRpcResponse<unknown>) => void
      onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
      onError?: (error: { code: string; message: string }) => void
      onClose?: () => void
    }
  ) => Promise<RuntimeEnvironmentSubscriptionHandle>
  callOrpcProcedure: (
    args: { selector: string; path: readonly string[]; input: unknown; timeoutMs?: number },
    options?: {
      signal?: AbortSignal
      onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
    }
  ) => Promise<unknown>
  subscribeOrpcProcedure: (
    args: { selector: string; path: readonly string[]; input: unknown },
    options?: { signal?: AbortSignal }
  ) => Promise<AsyncIterable<ShellRuntimeEnvironmentOrpcStreamEvent>>
}
