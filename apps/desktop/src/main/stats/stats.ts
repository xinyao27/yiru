import { ipcMain } from 'electron'

import type { StatsCollector } from './collector'
import { buildStatsSummary } from './summary'

export function registerStatsHandlers(stats: StatsCollector): void {
  ipcMain.handle('stats:summary', async () => {
    return buildStatsSummary(stats)
  })
}
