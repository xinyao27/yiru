import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { updateHomeStatsByHost } from './stats-state'
import { parseRuntimeStatsSummary } from './stats-summary'

export async function refreshHomeStatsForHost(
  client: RpcClient,
  hostId: string,
  isDisposed: () => boolean = () => false
): Promise<void> {
  try {
    const result = await callRuntimeOrpc(client, (runtime) => runtime.stats.summary, {
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
