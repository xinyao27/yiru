export class SpoolOwnerWorktreeCatalogError extends Error {
  constructor(readonly code: 'ambiguous' | 'resource-limit' | 'unavailable') {
    super(`spool_worktree_catalog_${code}`)
    this.name = 'SpoolOwnerWorktreeCatalogError'
  }
}

export class SpoolPublicationValidationError extends Error {
  constructor(readonly code: 'invalid-catalog' | 'resource-limit') {
    super(`spool_publication_${code}`)
    this.name = 'SpoolPublicationValidationError'
  }
}

export function isPublicationResourceLimit(error: unknown): boolean {
  return (
    (error instanceof SpoolOwnerWorktreeCatalogError && error.code === 'resource-limit') ||
    (error instanceof SpoolPublicationValidationError && error.code === 'resource-limit')
  )
}
