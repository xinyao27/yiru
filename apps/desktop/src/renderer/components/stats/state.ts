import type { StatsSummaryResult } from '@yiru/runtime-protocol/stats'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import type { AppState } from '~renderer/store/types'
import type { StatsSummary } from '~shared/types'

export type StatsSlice = {
  statsSummary: StatsSummary | null
  fetchStatsSummary: (refreshUsage?: boolean) => Promise<void>
}

function isStatsSummaryAvailable(result: StatsSummaryResult): result is StatsSummary {
  return Object.keys(result).length > 0
}

export const createStatsSlice: StateCreator<AppState, [], [], StatsSlice> = (set, get) => ({
  statsSummary: null,

  fetchStatsSummary: async (refreshUsage = false) => {
    try {
      const summary = await callRuntimeOrpc(
        getActiveRuntimeTarget(get().settings),
        (client) => client.stats.summary,
        { refreshUsage }
      )
      // Why: the runtime models "stats unavailable" as an all-optional variant
      // rather than an error, so an empty payload must clear the panel instead
      // of being stored as a summary with undefined fields.
      set({ statsSummary: isStatsSummaryAvailable(summary) ? summary : null })
    } catch (err) {
      console.error('Failed to fetch stats summary:', err)
    }
  }
})
