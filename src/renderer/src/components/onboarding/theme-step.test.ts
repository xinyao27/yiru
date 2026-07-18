import { describe, expect, it, vi } from 'vite-plus/test'
import { applyOnboardingThemeSelection } from './theme-step'

describe('applyOnboardingThemeSelection', () => {
  it('previews and persists the selected theme immediately', () => {
    const onThemeChange = vi.fn()
    const updateSettings = vi.fn().mockResolvedValue(undefined)

    applyOnboardingThemeSelection('light', onThemeChange, updateSettings)

    expect(onThemeChange).toHaveBeenCalledWith('light')
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'light' })
  })
})
