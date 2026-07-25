// Why: the pane Settings opens on must mount eagerly so the first paint is not
// an empty lazy placeholder.
const EAGER_SECTION_IDS = new Set(['appearance'])

export function deriveNeededSectionIds(args: {
  navSectionIds: string[]
  mountedSectionIds: Set<string>
  activeSectionId: string | null
  pendingSectionId: string | null
  query: string
  visibleSectionIds: Set<string>
}): Set<string> {
  const hasSearchQuery = args.query.trim() !== ''
  const next = hasSearchQuery ? new Set<string>() : new Set(args.mountedSectionIds)
  if (!hasSearchQuery) {
    for (const sectionId of args.navSectionIds) {
      if (EAGER_SECTION_IDS.has(sectionId)) {
        next.add(sectionId)
      }
    }
  }
  if (
    args.activeSectionId &&
    (!hasSearchQuery || args.visibleSectionIds.has(args.activeSectionId))
  ) {
    next.add(args.activeSectionId)
  }
  if (args.pendingSectionId) {
    next.add(args.pendingSectionId)
  }
  return next
}

export function getInitialMountedSectionIds(): Set<string> {
  return new Set(EAGER_SECTION_IDS)
}
