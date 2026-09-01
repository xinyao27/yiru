export const CODEX_SESSION_WINDOW_MINUTES = 300
export const CODEX_WEEKLY_WINDOW_MINUTES = 10_080

const CODEX_WINDOW_DURATION_TOLERANCE_MINUTES = 1

export type CodexRpcRateWindow = {
  usedPercent?: unknown
  windowDurationMins?: unknown
  resetsAt?: unknown
}

export type CodexRpcRateLimits = {
  primary?: CodexRpcRateWindow | null
  secondary?: CodexRpcRateWindow | null
}

/**
 * Per-limit buckets keyed by limit id, as returned alongside the account-level
 * `rateLimits`. Values repeat the account-level shape; the map also repeats the
 * account limit itself under its own id.
 */
export type CodexRpcRateLimitsByLimitId = Record<string, CodexRpcRateLimits | null | undefined>

type MappableCodexRpcRateWindow = CodexRpcRateWindow & { usedPercent: number }
type CodexRateLimitWindowKind = 'session' | 'weekly' | null

function isMappableWindow(
  window: CodexRpcRateWindow | null | undefined
): window is MappableCodexRpcRateWindow {
  return typeof window?.usedPercent === 'number' && Number.isFinite(window.usedPercent)
}

function classifyWindow(window: MappableCodexRpcRateWindow): CodexRateLimitWindowKind {
  const duration = window.windowDurationMins
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return null
  }
  if (
    Math.abs(duration - CODEX_SESSION_WINDOW_MINUTES) <= CODEX_WINDOW_DURATION_TOLERANCE_MINUTES
  ) {
    return 'session'
  }
  if (Math.abs(duration - CODEX_WEEKLY_WINDOW_MINUTES) <= CODEX_WINDOW_DURATION_TOLERANCE_MINUTES) {
    return 'weekly'
  }
  return null
}

export function classifyCodexRateLimitWindows(
  result: CodexRpcRateLimits | null | undefined,
  byLimitId?: CodexRpcRateLimitsByLimitId | null
): {
  session: MappableCodexRpcRateWindow | null
  weekly: MappableCodexRpcRateWindow | null
} {
  const primary = isMappableWindow(result?.primary) ? result.primary : null
  const secondary = isMappableWindow(result?.secondary) ? result.secondary : null
  let session: MappableCodexRpcRateWindow | null = null
  let weekly: MappableCodexRpcRateWindow | null = null

  for (const window of [primary, secondary]) {
    if (!window) {
      continue
    }
    const kind = classifyWindow(window)
    if (kind === 'session' && !session) {
      session = window
    } else if (kind === 'weekly' && !weekly) {
      weekly = window
    }
  }

  // Why: older app-server builds omitted duration metadata, so keep their
  // positional mapping only for windows whose duration cannot be classified.
  if (!session && primary && classifyWindow(primary) === null) {
    session = primary
  }
  if (!weekly && secondary && classifyWindow(secondary) === null) {
    weekly = secondary
  }

  // Why: the account-level limit can report only one window — a Pro account
  // currently exposes weekly there and keeps its 5h buckets per model. Fill an
  // empty slot from the per-limit map so the status bar still shows both.
  if (!session || !weekly) {
    const fromLimits = pickBusiestWindowsByLimitId(byLimitId)
    session = session ?? fromLimits.session
    weekly = weekly ?? fromLimits.weekly
  }

  return { session, weekly }
}

/**
 * Picks the most-consumed window per kind across the per-limit buckets.
 *
 * Why busiest rather than first: per-model buckets are independent, and one
 * status-bar number per window has to answer "how close am I to being blocked",
 * which the fullest bucket decides.
 */
function pickBusiestWindowsByLimitId(byLimitId: CodexRpcRateLimitsByLimitId | null | undefined): {
  session: MappableCodexRpcRateWindow | null
  weekly: MappableCodexRpcRateWindow | null
} {
  let session: MappableCodexRpcRateWindow | null = null
  let weekly: MappableCodexRpcRateWindow | null = null
  for (const limit of Object.values(byLimitId ?? {})) {
    for (const window of [limit?.primary, limit?.secondary]) {
      if (!isMappableWindow(window)) {
        continue
      }
      const kind = classifyWindow(window)
      if (kind === 'session' && (!session || window.usedPercent > session.usedPercent)) {
        session = window
      } else if (kind === 'weekly' && (!weekly || window.usedPercent > weekly.usedPercent)) {
        weekly = window
      }
    }
  }
  return { session, weekly }
}
