import { describe, expect, it, vi } from 'vite-plus/test'

import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { getUsageRosterRowState } from './usage-roster-row-state'

function provider(overrides: Partial<ProviderRateLimits> = {}): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: 0,
    error: null,
    status: 'ok',
    ...overrides
  }
}

describe('getUsageRosterRowState', () => {
  it('keeps pending providers in a loading state', () => {
    expect(getUsageRosterRowState(provider({ status: 'fetching' }), false)).toEqual({
      kind: 'loading',
      statusLabel: 'Loading usage…'
    })
  })

  it('offers sign-in only for confirmed missing credentials', () => {
    expect(
      getUsageRosterRowState(
        provider({ status: 'error', usageMetadata: { failureKind: 'missing-credentials' } }),
        false
      )
    ).toEqual({ kind: 'sign-in', statusLabel: 'not signed in' })
    expect(
      getUsageRosterRowState(
        provider({
          status: 'error',
          error: ['OAuth token', 'is stale'].join(' '),
          usageMetadata: { failureKind: 'stale-token' }
        }),
        false
      )
    ).toEqual({ kind: 'error', statusLabel: 'Refreshing sign-in' })
  })

  it('does not invent an in-app sign-in action for CLI-owned Kimi credentials', () => {
    expect(
      getUsageRosterRowState(
        provider({
          provider: 'kimi',
          status: 'error',
          error: ['Kimi token expired', 'open Kimi to refresh'].join(' — ')
        }),
        false
      )
    ).toEqual({ kind: 'error', statusLabel: 'Refresh failed' })
  })

  it('lets cached usage win over a stale error status', () => {
    expect(getUsageRosterRowState(provider({ status: 'error' }), true)).toEqual({
      kind: 'usage',
      statusLabel: null
    })
  })
})
