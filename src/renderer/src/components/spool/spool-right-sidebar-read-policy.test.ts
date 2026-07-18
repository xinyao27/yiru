import { describe, expect, it } from 'vite-plus/test'
import { shouldReadSpoolChecks } from './spool-right-sidebar-read-policy'

describe('shouldReadSpoolChecks', () => {
  it('does not fetch checks while another remote sidebar tab is active', () => {
    expect(
      shouldReadSpoolChecks({
        activeTab: 'explorer',
        rightSidebarOpen: true,
        connected: true,
        supportsGit: true
      })
    ).toBe(false)
  })

  it('fetches checks when the connected Git worktree checks tab is visible', () => {
    expect(
      shouldReadSpoolChecks({
        activeTab: 'checks',
        rightSidebarOpen: true,
        connected: true,
        supportsGit: true
      })
    ).toBe(true)
  })
})
