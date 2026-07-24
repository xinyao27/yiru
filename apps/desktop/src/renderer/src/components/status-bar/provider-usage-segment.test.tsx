import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vite-plus/test'

import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values?.[key] ?? ''))
}))
vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => null }))

import { ProviderUsageSegment } from './provider-usage-segment'

function windowOf(usedPercent: number, windowMinutes: number): RateLimitWindow {
  return { usedPercent, windowMinutes, resetsAt: null, resetDescription: null }
}

function limits(overrides: Partial<ProviderRateLimits> = {}): ProviderRateLimits {
  return {
    provider: 'opencode-go',
    session: windowOf(10, 300),
    weekly: windowOf(20, 10_080),
    monthly: windowOf(30, 43_200),
    updatedAt: 0,
    error: null,
    status: 'ok',
    ...overrides
  }
}

describe('ProviderUsageSegment modes', () => {
  it('shows only the highest-used window in compact mode', () => {
    const markup = renderToStaticMarkup(
      <ProviderUsageSegment limits={limits()} compact display="used" mode="compact" />
    )

    expect(markup).toContain('>30d<')
    expect(markup).toContain('width:30%')
    expect(markup).toContain('>30%<')
    expect(markup.indexOf('>30d<')).toBeLessThan(markup.indexOf('width:30%'))
    expect(markup.indexOf('width:30%')).toBeLessThan(markup.indexOf('>30%<'))
    expect(markup).not.toContain('>10%<')
    expect(markup).not.toContain('>20%<')
  })

  it('preserves the existing all-window presentation in verbose mode', () => {
    const markup = renderToStaticMarkup(
      <ProviderUsageSegment
        limits={limits({ provider: 'claude', fableWeekly: windowOf(35, 10_080) })}
        compact={false}
        display="used"
        mode="verbose"
      />
    )

    expect(markup).toContain('>5h<')
    expect(markup).toContain('width:10%')
    expect(markup).toContain('>10%<')
    expect(markup.indexOf('>5h<')).toBeLessThan(markup.indexOf('width:10%'))
    expect(markup.indexOf('width:10%')).toBeLessThan(markup.indexOf('>10%<'))
    expect(markup).toContain('>wk<')
    expect(markup).toContain('width:20%')
    expect(markup).toContain('>20%<')
    expect(markup).toContain('>Fable<')
    expect(markup).toContain('width:35%')
    expect(markup).toContain('>35%<')
    expect(markup).not.toContain('>30%<')
  })
})
