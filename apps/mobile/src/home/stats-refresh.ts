import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { updateHomeStatsByHost } from './stats-state'
import { parseRuntimeStatsSummary } from './stats-summary'
import { ensureUsageRange } from './usage/range-preference'

export async function refreshHomeStatsForHost(
  client: RpcClient,
  hostId: string,
  isDisposed: () => boolean = () => false
): Promise<void> {
  try {
    // Why: home and activity insights share one stats store, so both read the
    // same selected window rather than overwriting each other's range.
    const range = await ensureUsageRange()
    const result = await callRuntimeOrpc(client, (runtime) => runtime.stats.summary, {
      range,
      refreshUsage: true
    })
    if (isDisposed()) {
      return
    }
    const summary = parseRuntimeStatsSummary(result)
    if (!summary) {
      return
    }
    updateHomeStatsByHost((previous) => ({
      ...previous,
      [hostId]: summary
    }))
  } catch {
    // Why: cached stats remain useful while a desktop reconnects; the next
    // focus, foreground, or periodic refresh retries the authoritative read.
  }
}
