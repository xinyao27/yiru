import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  armPrimarySelectionNativePasteSuppression,
  setPrimarySelectionEnabled,
  shouldSuppressPrimarySelectionNativePaste
} from './primary-selection'

describe('primary-selection native paste suppression', () => {
  beforeEach(() => {
    setPrimarySelectionEnabled(false)
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
  })

  afterEach(() => {
    setPrimarySelectionEnabled(false)
    vi.unstubAllGlobals()
  })

  it('requires an enabled Linux primary-selection pipeline', () => {
    armPrimarySelectionNativePasteSuppression(1_000)
    expect(shouldSuppressPrimarySelectionNativePaste(1_000)).toBe(false)

    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' })
    setPrimarySelectionEnabled(true)
    armPrimarySelectionNativePasteSuppression(1_000)
    expect(shouldSuppressPrimarySelectionNativePaste(1_000)).toBe(false)
  })

  it('covers the native follow-up window and expires afterwards', () => {
    setPrimarySelectionEnabled(true)
    armPrimarySelectionNativePasteSuppression(1_000)

    expect(shouldSuppressPrimarySelectionNativePaste(1_700)).toBe(true)
    expect(shouldSuppressPrimarySelectionNativePaste(1_800)).toBe(false)
  })

  it('clears the window when the feature is disabled', () => {
    setPrimarySelectionEnabled(true)
    armPrimarySelectionNativePasteSuppression(1_000)
    setPrimarySelectionEnabled(false)
    setPrimarySelectionEnabled(true)

    expect(shouldSuppressPrimarySelectionNativePaste(1_000)).toBe(false)
  })
})
