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
