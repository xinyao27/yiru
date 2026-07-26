import { isPublicationResourceLimit } from './publication-errors'

export type CoworkingVisibilityErrorCode =
  | 'incarnation-changed'
  | 'not-initialized'
  | 'not-shareable'
  | 'overlapping-root'
  | 'persistence-failed'
  | 'resource-limit'
  | 'resource-not-found'
  | 'stale-worktree'

export class CoworkingVisibilityError extends Error {
  constructor(
    readonly code: CoworkingVisibilityErrorCode,
    options?: ErrorOptions
  ) {
    super(`coworking_visibility_${code}`, options)
    this.name = 'CoworkingVisibilityError'
  }
}

export function rethrowPublicationResourceLimit(error: unknown): never {
  if (isPublicationResourceLimit(error)) {
    throw new CoworkingVisibilityError('resource-limit', { cause: error })
  }
  throw error
}
