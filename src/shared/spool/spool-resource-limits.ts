export const SPOOL_MAX_TERMINAL_SUBSCRIPTIONS_PER_CONNECTION_WORKTREE = 8
export const SPOOL_MAX_STREAM_QUEUED_BYTES = 8 * 1024 * 1024
export const SPOOL_MAX_LIVE_SESSIONS_PER_WORKTREE = 5_000
// Why: an SSH-backed first page may need to discover and inspect a complete frozen inventory.
export const SPOOL_SESSION_PAGE_REQUEST_TIMEOUT_MS = 5 * 60_000

// Why: coding-agent JSONL routinely exceeds the preview limit, but remote
// inventory must still have a fixed ceiling independent of host file size.
export const SPOOL_SESSION_INVENTORY_STREAM_PROFILE = 'session-inventory'
export const SPOOL_SESSION_INVENTORY_TRANSCRIPT_MAX_BYTES = 128 * 1024 * 1024
export const SPOOL_SESSION_INVENTORY_JSONL_LINE_MAX_BYTES = 16 * 1024 * 1024
