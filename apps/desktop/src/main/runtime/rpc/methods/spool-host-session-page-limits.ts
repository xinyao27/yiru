// Why: paired aliases only bridge active page chains; expiry and caps bound reconnect leftovers.
export const SPOOL_HOST_SESSION_CURSOR_IDLE_TTL_MS = 15 * 60_000
export const SPOOL_HOST_SESSION_MAX_ACTIVE_CHAINS = 256
export const SPOOL_HOST_SESSION_MAX_REPLAYABLE_CURSORS = 4
export const SPOOL_HOST_SESSION_ACTIVE_EXPIRY_RECHECK_MS = 30_000
// Why: owner scanners may choose their own opaque format, but never an unbounded one.
export const SPOOL_HOST_SESSION_MAX_INNER_CURSOR_LENGTH = 2_048

export function spoolHostSessionNextExpiryDelay(
  chains: Iterable<{ activeReads: number; lastAccessedAt: number }>,
  now: number
): number {
  let nextExpiryAt = Number.POSITIVE_INFINITY
  for (const chain of chains) {
    nextExpiryAt = Math.min(
      nextExpiryAt,
      chain.activeReads > 0
        ? now + SPOOL_HOST_SESSION_ACTIVE_EXPIRY_RECHECK_MS
        : chain.lastAccessedAt + SPOOL_HOST_SESSION_CURSOR_IDLE_TTL_MS
    )
  }
  return Math.max(1, nextExpiryAt - now)
}
