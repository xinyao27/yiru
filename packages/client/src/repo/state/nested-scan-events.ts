import type { NestedRepoScanResult } from '@yiru/runtime-protocol/workbench/types'
import { createRuntimeOrpcClient } from '~renderer/runtime/orpc-client'
import type { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import { normalizeNestedRepoScanResult } from './update-model'

// Why: nested-scan progress is per scanId, not host-wide. The caller owns the
// identifier and callback while this module owns the stream lifecycle.
export async function subscribeToNestedRepoScanProgress(
  target: ReturnType<typeof getActiveRuntimeTarget>,
  scanId: string,
  onProgress: (scan: NestedRepoScanResult) => void
): Promise<() => void> {
  const abort = new AbortController()
  try {
    const connection = await createRuntimeOrpcClient(target, {
      timeoutMs: 15_000,
      signal: abort.signal
    })
    const stream = await connection.client.projectGroup.events.subscribe(undefined, {
      signal: abort.signal
    })
    void (async () => {
      try {
        for await (const event of stream) {
          if (event.type === 'nestedRepoScanProgress' && event.scanId === scanId) {
            onProgress(normalizeNestedRepoScanResult(event.scan))
          }
        }
      } catch {
        // Why: the scan RPC resolves independently; losing progress ticks does
        // not turn an otherwise successful scan into a failure.
      } finally {
        connection.close()
      }
    })()
    return () => abort.abort()
  } catch (error) {
    console.error('Failed to subscribe to nested repo scan progress:', error)
    return () => {}
  }
}
