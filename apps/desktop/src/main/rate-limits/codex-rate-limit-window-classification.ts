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

export function classifyCodexRateLimitWindows(result: CodexRpcRateLimits | null | undefined): {
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

  return { session, weekly }
}
