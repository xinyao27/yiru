import { createORPCClient, ORPCError, type ClientLink } from '@orpc/client'
import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

// Why: shared with the real oRPC peer client (`orpc-channel.ts`) so both can
// be assigned to the same `WebRuntimeOrpcClient` type — this fallback link
// simply never populates `onBinary`, the same gap the legacy JSON envelope
// has for every other event-iterator leaf on the web path today.
export type WebRuntimeOrpcClientContext = {
  onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
}

export type WebRuntimeOrpcClient = ContractRouterClient<
  typeof runtimeContract,
  WebRuntimeOrpcClientContext
>

export type LegacyRuntimeCall = (
  method: string,
  input: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number }
) => Promise<RuntimeRpcResponse<unknown>>

export const LEGACY_RUNTIME_STREAM_METHODS = {
  filesWatch: ['files', 'watch'].join('.'),
  filesUnwatch: ['files', 'unwatch'].join('.')
} as const

const LEGACY_BACKGROUND_RUNTIME_METHODS = new Set(
  [
    ['hostedReview', 'forBranch'],
    ['github', 'prForBranch'],
    ['github', 'listWorkItems'],
    ['github', 'countWorkItems'],
    ['git', 'status'],
    ['git', 'history'],
    ['git', 'conflictOperation'],
    ['git', 'branchCompare'],
    ['git', 'upstreamStatus'],
    ['worktree', 'prefetchCreateBase']
  ].map((path) => path.join('.'))
)

export function isLegacyBackgroundRuntimeMethod(method: string): boolean {
  return LEGACY_BACKGROUND_RUNTIME_METHODS.has(method)
}

export function createLegacyRuntimeOrpcClient(call: LegacyRuntimeCall): WebRuntimeOrpcClient {
  const link: ClientLink<WebRuntimeOrpcClientContext> = {
    call: async (path, input, options) => {
      const response = await call(path.join('.'), input, { signal: options.signal })
      if (!response.ok) {
        throw new ORPCError(response.error.code, {
          message: response.error.message,
          data: response.error.data
        })
      }
      return response.result
    }
  }
  return createORPCClient<WebRuntimeOrpcClient>(link)
}

export function createLegacyRuntimeHeartbeatRequest(id: string, deviceToken: string): unknown {
  return {
    id,
    deviceToken,
    method: ['status', 'get'].join('.')
  }
}
