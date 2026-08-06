import { ipcMain } from 'electron'

import type { StatsCollector } from './collector'
import { buildStatsSummary, type StatsUsageStores } from './summary'

export function registerStatsHandlers(stats: StatsCollector, usageStores?: StatsUsageStores): void {
  ipcMain.handle('stats:summary', async (_event, request: unknown) => {
    return buildStatsSummary(stats, usageStores, isRefreshUsageRequest(request))
  })
}

function isRefreshUsageRequest(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.fromEntries(Object.entries(value)).refreshUsage === true
}
