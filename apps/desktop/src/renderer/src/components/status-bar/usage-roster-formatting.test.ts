import { describe, expect, it } from 'vite-plus/test'

import { formatPlanLabel, usageTextColorClass } from './usage-roster-formatting'

describe('usage roster formatting', () => {
  it('formats provider plan labels across common separators', () => {
    expect(formatPlanLabel('plus')).toBe('Plus')
    expect(formatPlanLabel('chatgpt_business')).toBe('ChatGPT Business')
    expect(formatPlanLabel('TEAM-plus')).toBe('Team Plus')
    expect(formatPlanLabel('   ')).toBeNull()
  })

  it('uses the same caution thresholds as the usage bars', () => {
    expect(usageTextColorClass(59)).toBe('text-foreground')
    expect(usageTextColorClass(60)).toBe('text-amber-500')
    expect(usageTextColorClass(80)).toBe('text-red-500')
  })
})
