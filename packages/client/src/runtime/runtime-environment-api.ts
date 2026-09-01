import type { ShellRuntimeEnvironmentOrpcStreamEvent } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type { PublicKnownRuntimeEnvironment } from '@yiru/runtime-protocol/workbench/runtime-environments'
import type { RuntimeStatus } from '@yiru/runtime-protocol/workbench/runtime-types'

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
