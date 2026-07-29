import { ipcMain } from 'electron'

import type { StatsCollector } from './collector'
import { buildStatsSummary, type StatsUsageStores } from './summary'

export function registerStatsHandlers(stats: StatsCollector, usageStores?: StatsUsageStores): void {
  ipcMain.handle('stats:summary', async () => {
    return buildStatsSummary(stats, usageStores)
  })
}
