import type { RpcClient } from '../transport/rpc-client'
import { updateHomeStatsByHost } from './stats-state'
import { parseRuntimeStatsSummary } from './stats-summary'

export async function refreshHomeStatsForHost(
  client: RpcClient,
  hostId: string,
  isDisposed: () => boolean = () => false
): Promise<void> {
  try {
    const response = await client.sendRequest('stats.summary', { refreshUsage: true })
    if (isDisposed() || !response.ok) {
      return
    }
    const summary = parseRuntimeStatsSummary(response.result)
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
