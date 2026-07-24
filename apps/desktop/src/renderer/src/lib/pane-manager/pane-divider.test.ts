import { describe, expect, it } from 'vite-plus/test'

import { getDividerHitSize } from './pane-divider'

describe('getDividerHitSize', () => {
  it('keeps the hairline divider grab target at least as wide as the legacy default', () => {
    expect(getDividerHitSize({ dividerThicknessPx: 1 })).toBe(9)
  })

  it('expands the grab target around a custom divider width', () => {
    expect(getDividerHitSize({ dividerThicknessPx: 6 })).toBe(12)
  })
})
