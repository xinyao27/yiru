import { describe, expect, it } from 'vite-plus/test'
import { getLinkedWorkItemSuggestedName } from './mobile-workspace-name'

describe('mobile workspace names', () => {
  it('removes apostrophes inside words instead of splitting them', () => {
    expect(
      getLinkedWorkItemSuggestedName({
        title: "Can't enable browser notifications"
      })
    ).toBe('cant-enable-browser-notifications')

    expect(
      getLinkedWorkItemSuggestedName({
        title: 'Can’t enable browser notifications'
      })
    ).toBe('cant-enable-browser-notifications')
  })
})
