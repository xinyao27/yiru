import { describe, expect, it } from 'vite-plus/test'
import { shouldPollChromiumErrorPage } from './chromium-error-page-polling'

describe('shouldPollChromiumErrorPage', () => {
  it('runs the fallback chrome-error poll only for the active loading browser pane', () => {
    expect(shouldPollChromiumErrorPage({ isActive: true, loading: true })).toBe(true)
    expect(shouldPollChromiumErrorPage({ isActive: false, loading: true })).toBe(false)
    expect(shouldPollChromiumErrorPage({ isActive: true, loading: false })).toBe(false)
    expect(shouldPollChromiumErrorPage({ isActive: false, loading: false })).toBe(false)
  })
})
