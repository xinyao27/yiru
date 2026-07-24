import { describe, expect, it } from 'vite-plus/test'

import { normalizeStatusBarUsageMode } from './status-bar-usage-mode'

describe('normalizeStatusBarUsageMode', () => {
  it('preserves supported values and defaults invalid input to detailed usage', () => {
    expect(normalizeStatusBarUsageMode('compact')).toBe('compact')
    expect(normalizeStatusBarUsageMode('verbose')).toBe('verbose')
    expect(normalizeStatusBarUsageMode('expanded')).toBe('verbose')
    expect(normalizeStatusBarUsageMode(undefined)).toBe('verbose')
  })
})
