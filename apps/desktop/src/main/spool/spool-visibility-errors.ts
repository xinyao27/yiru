import { isPublicationResourceLimit } from './spool-publication-errors'

export type SpoolVisibilityErrorCode =
  | 'incarnation-changed'
  | 'not-initialized'
  | 'not-shareable'
  | 'overlapping-root'
  | 'persistence-failed'
  | 'resource-limit'
  | 'resource-not-found'
  | 'stale-worktree'

export class SpoolVisibilityError extends Error {
  constructor(
    readonly code: SpoolVisibilityErrorCode,
    options?: ErrorOptions
  ) {
    super(`spool_visibility_${code}`, options)
    this.name = 'SpoolVisibilityError'
  }
}

export function rethrowPublicationResourceLimit(error: unknown): never {
  if (isPublicationResourceLimit(error)) {
    throw new SpoolVisibilityError('resource-limit', { cause: error })
  }
  throw error
}
