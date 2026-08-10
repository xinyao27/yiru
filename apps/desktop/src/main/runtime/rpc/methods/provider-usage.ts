import type { ProviderRateLimits } from '@yiru/runtime-protocol/contract'
import { fetchCursorRateLimits } from '~main/runtime/cursor-usage/fetcher'

import type { RpcContext } from '../core'

// Why: 切片 80 retired this leaf's legacy `defineMethod` registration —
// `orpc/router-direct/provider-usage.ts` wires this handler straight to the
// contract now.
export function fetchRuntimeCursorUsage(
  _params: void,
  { signal }: RpcContext
): Promise<ProviderRateLimits> {
  return fetchCursorRateLimits({ signal, target: { runtime: 'host' } })
}
