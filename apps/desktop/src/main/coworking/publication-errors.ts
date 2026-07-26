export class CoworkingOwnerWorktreeCatalogError extends Error {
  constructor(readonly code: 'ambiguous' | 'resource-limit' | 'unavailable') {
    super(`coworking_worktree_catalog_${code}`)
    this.name = 'CoworkingOwnerWorktreeCatalogError'
  }
}

export class CoworkingPublicationValidationError extends Error {
  constructor(readonly code: 'invalid-catalog' | 'resource-limit') {
    super(`coworking_publication_${code}`)
    this.name = 'CoworkingPublicationValidationError'
  }
}

export function isPublicationResourceLimit(error: unknown): boolean {
  return (
    (error instanceof CoworkingOwnerWorktreeCatalogError && error.code === 'resource-limit') ||
    (error instanceof CoworkingPublicationValidationError && error.code === 'resource-limit')
  )
}
