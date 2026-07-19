import type { StateCreator } from 'zustand'

import type { StatsSummary } from '../../../../shared/types'
import type { AppState } from '../types'

export type StatsSlice = {
  statsSummary: StatsSummary | null
  fetchStatsSummary: () => Promise<void>
}

export const createStatsSlice: StateCreator<AppState, [], [], StatsSlice> = (set) => ({
  statsSummary: null,

  fetchStatsSummary: async () => {
    try {
      const summary = await window.api.stats.getSummary()
      set({ statsSummary: summary })
    } catch (err) {
      console.error('Failed to fetch stats summary:', err)
    }
  }
})
