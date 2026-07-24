import { describe, expect, it } from 'vite-plus/test'

import {
  createMobileNativeChatUnconfirmedMatch,
  findLandedMobileNativeChatUnconfirmedMatches
} from './mobile-native-chat-unconfirmed-reconcile'

describe('Mobile native chat unconfirmed reconciliation', () => {
  it('does not let the active transcript clear another tab or session', () => {
    const tabA = createMobileNativeChatUnconfirmedMatch(
      {
        draftKey: 'tab-a',
        pendingKey: 'session-a',
        normalizedText: 'same',
        baselineOccurrences: 0
      },
      []
    )
    const tabB = createMobileNativeChatUnconfirmedMatch(
      {
        draftKey: 'tab-b',
        pendingKey: 'session-b',
        normalizedText: 'same',
        baselineOccurrences: 0
      },
      [tabA]
    )

    expect(
      findLandedMobileNativeChatUnconfirmedMatches({
        held: [tabA, tabB],
        activeDraftKey: 'tab-b',
        activePendingKey: 'session-b',
        occurrenceCounts: new Map([['same', 1]])
      })
    ).toEqual([tabB])
  })

  it('requires one transcript occurrence per identical unconfirmed send', () => {
    const first = createMobileNativeChatUnconfirmedMatch(
      {
        draftKey: 'tab-a',
        pendingKey: 'session-a',
        normalizedText: 'same',
        baselineOccurrences: 0
      },
      []
    )
    const second = createMobileNativeChatUnconfirmedMatch(
      {
        draftKey: 'tab-a',
        pendingKey: 'session-a',
        normalizedText: 'same',
        baselineOccurrences: 0
      },
      [first]
    )

    expect(first.expectedOccurrence).toBe(1)
    expect(second.expectedOccurrence).toBe(2)
    expect(
      findLandedMobileNativeChatUnconfirmedMatches({
        held: [first, second],
        activeDraftKey: 'tab-a',
        activePendingKey: 'session-a',
        occurrenceCounts: new Map([['same', 1]])
      })
    ).toEqual([first])
  })
})
