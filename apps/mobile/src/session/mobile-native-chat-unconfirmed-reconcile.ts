export type MobileNativeChatUnconfirmedOrigin = {
  draftKey: string
  pendingKey: string | null
  normalizedText: string
  baselineOccurrences: number
}

export type MobileNativeChatUnconfirmedMatch = MobileNativeChatUnconfirmedOrigin & {
  expectedOccurrence: number
}

function hasSameScope(
  left: Pick<MobileNativeChatUnconfirmedOrigin, 'draftKey' | 'pendingKey'>,
  right: Pick<MobileNativeChatUnconfirmedOrigin, 'draftKey' | 'pendingKey'>
): boolean {
  return left.draftKey === right.draftKey && left.pendingKey === right.pendingKey
}

export function createMobileNativeChatUnconfirmedMatch(
  origin: MobileNativeChatUnconfirmedOrigin,
  held: readonly MobileNativeChatUnconfirmedMatch[]
): MobileNativeChatUnconfirmedMatch {
  const earlierOutstanding = held.filter(
    (entry) =>
      hasSameScope(entry, origin) &&
      entry.normalizedText === origin.normalizedText &&
      entry.expectedOccurrence > origin.baselineOccurrences
  ).length
  return {
    ...origin,
    expectedOccurrence: origin.baselineOccurrences + earlierOutstanding + 1
  }
}

export function findLandedMobileNativeChatUnconfirmedMatches(args: {
  held: readonly MobileNativeChatUnconfirmedMatch[]
  activeDraftKey: string | null
  activePendingKey: string | null
  occurrenceCounts: ReadonlyMap<string, number>
}): MobileNativeChatUnconfirmedMatch[] {
  if (!args.activeDraftKey) {
    return []
  }
  return args.held.filter(
    (entry) =>
      entry.draftKey === args.activeDraftKey &&
      (entry.pendingKey === null || entry.pendingKey === args.activePendingKey) &&
      (args.occurrenceCounts.get(entry.normalizedText) ?? 0) >= entry.expectedOccurrence
  )
}
