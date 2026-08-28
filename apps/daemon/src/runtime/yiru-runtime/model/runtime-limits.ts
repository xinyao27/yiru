import type { RuntimeWorktreeStatus } from '@yiru/runtime-protocol/workbench/runtime-types'

export const WAIT_BLOCKED_CHECK_MIN_INTERVAL_MS = 50
// Why: chunks that can complete an actionable prompt bypass the throttle so
// blocked stamps stay per-chunk-immediate; the pattern heads mirror
// findTerminalWaitBlockedSignal. Scanned over the new chunk plus a short
// carry only — never the accumulated window.
export const WAIT_BLOCKED_KEYWORD_PATTERN =
  /press enter|press t to trust|do you trust|trust this|trusted workspace|update available|choose working directory|codex just got an upgrade|hooks need review/
export const WAIT_BLOCKED_KEYWORD_CARRY_CHARS = 31
export const MAX_TAIL_LINES = 2000
export const MAX_TAIL_CHARS = 256 * 1024
export const MAX_TAIL_PARTIAL_CHARS = 4000
export const MAX_TAIL_PENDING_ANSI_CHARS = 4096
export const DEFAULT_TERMINAL_READ_LIMIT = 120
export const MAX_TERMINAL_READ_LIMIT = 2000
export const MAX_TERMINAL_PREVIEW_CHARS = 32 * 1024
export const MAX_PREVIEW_LINES = 6
export const MAX_PREVIEW_CHARS = 300
export const WORKTREE_STATUS_PRIORITY: Record<RuntimeWorktreeStatus, number> = {
  inactive: 0,
  active: 1,
  done: 2,
  working: 3,
  permission: 4
}
export const DEFAULT_REPO_SEARCH_REFS_LIMIT = 25
export const DEFAULT_TERMINAL_LIST_LIMIT = 200
export const DEFAULT_WORKTREE_LIST_LIMIT = 200
export const DEFAULT_WORKTREE_PS_LIMIT = 200
export const DISCONNECTED_PTY_RECORD_MAX = 128
export const RESOLVED_WORKTREE_CACHE_TTL_MS = 1000
export const RESOLVED_WORKTREE_REPO_TIMEOUT_MS = 5000
export const PTY_CONTROLLER_LIST_TIMEOUT_MS = 3000
// Why (§3.3): 30s freshness window. A second worktree-create or dispatch-probe
// against the same repo+remote within this window reuses the previous successful
// fetch instead of repeating the round-trip. Chosen so rapid "new worktree"
// clicks and successive coordinator dispatches feel snappy, while still being
// short enough that a genuinely-changed remote is observed on the next action.
export const FETCH_FRESHNESS_MS = 30_000
// Why: bound create-path remote fetches so a Windows credential-manager GUI hang
// (STA-1292) can't wedge worktree creation forever; parity with the exact-base
// refresh sibling's timeout.
export const REMOTE_FETCH_TIMEOUT_MS = 60_000
export const REMOTE_FETCH_CACHE_MAX = 512
export const DRIFT_PROBE_SUBJECT_LIMIT = 5

export function setBoundedMapEntry<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number
): void {
  if (map.has(key)) {
    map.delete(key)
  }
  map.set(key, value)
  while (map.size > maxEntries) {
    const oldest = map.keys().next()
    if (oldest.done) {
      return
    }
    map.delete(oldest.value)
  }
}

export function getExplicitWorktreeIdSelector(selector: string | undefined): string | null {
  if (!selector?.startsWith('id:')) {
    return null
  }
  const id = selector.slice(3)
  return id.length > 0 ? id : null
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return new Promise<T>((resolve) => {
    timeout = setTimeout(() => resolve(fallback), timeoutMs)
    promise.then(
      (value) => resolve(value),
      () => resolve(fallback)
    )
  }).finally(() => {
    if (timeout) {
      clearTimeout(timeout)
    }
  })
}

export function withTimeoutResult<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<{ ok: true; value: T } | { ok: false }> {
  return withTimeout(
    promise.then((value) => ({ ok: true, value }) as const),
    timeoutMs,
    {
      ok: false
    }
  )
}
