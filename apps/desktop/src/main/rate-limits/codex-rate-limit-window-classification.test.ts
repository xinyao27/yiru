import { describe, expect, it } from 'vite-plus/test'

import { classifyCodexRateLimitWindows } from './codex-rate-limit-window-classification'

describe('classifyCodexRateLimitWindows', () => {
  it('uses duration rather than response position', () => {
    const weekly = { usedPercent: 72, windowDurationMins: 10_080 }
    const session = { usedPercent: 18, windowDurationMins: 300 }

    expect(classifyCodexRateLimitWindows({ primary: weekly, secondary: session })).toEqual({
      session,
      weekly
    })
  })

  it('supports weekly-only responses', () => {
    const weekly = { usedPercent: 40, windowDurationMins: 10_079 }

    expect(classifyCodexRateLimitWindows({ primary: weekly })).toEqual({
      session: null,
      weekly
    })
  })

  it('deduplicates windows of the same duration', () => {
    const firstSession = { usedPercent: 10, windowDurationMins: 300 }

    expect(
      classifyCodexRateLimitWindows({
        primary: firstSession,
        secondary: { usedPercent: 20, windowDurationMins: 301 }
      })
    ).toEqual({ session: firstSession, weekly: null })
  })

  it('keeps the legacy positional fallback when durations are absent', () => {
    const primary = { usedPercent: 12 }
    const secondary = { usedPercent: 34 }

    expect(classifyCodexRateLimitWindows({ primary, secondary })).toEqual({
      session: primary,
      weekly: secondary
    })
  })
})
