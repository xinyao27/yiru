export const COWORKING_PUBLICATION_REPO_SCAN_CONCURRENCY = 8
export const COWORKING_PUBLICATION_ROOT_RESOLUTION_CONCURRENCY = 8

// Why: overlap validation must inspect Private roots too, but owner inventory
// is local state and cannot be allowed to fan out or grow without a bound.
export const COWORKING_PUBLICATION_MAX_REGISTERED_REPOS = 512
export const COWORKING_PUBLICATION_MAX_REGISTERED_WORKTREES = 4_096
