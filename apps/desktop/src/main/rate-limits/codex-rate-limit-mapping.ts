import type { ProviderRateLimits, RateLimitWindow } from '~shared/rate-limit-types'

import type { BackendRateLimitWindow } from './codex-rate-limit-contracts'
import type { CodexRpcRateWindow } from './codex-rate-limit-window-classification'

export function abortedCodexRateLimitResult(): ProviderRateLimits {
  return {
    provider: 'codex',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: 'Rate-limit fetch aborted',
    status: 'error'
  }
}

export function mapRpcWindow(
  raw: CodexRpcRateWindow | null | undefined,
  expectedWindowMinutes: number
): RateLimitWindow | null {
  if (!raw || typeof raw.usedPercent !== 'number' || !Number.isFinite(raw.usedPercent)) {
    return null
  }
  let resetDescription: string | null = null
  let resetsAt: number | null = null
  if (typeof raw.resetsAt === 'number' && Number.isFinite(raw.resetsAt) && raw.resetsAt > 0) {
    const date = new Date(raw.resetsAt * 1000)
    if (!Number.isNaN(date.getTime())) {
      resetsAt = date.getTime()
      const isToday = date.toDateString() === new Date().toDateString()
      resetDescription = isToday
        ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : date.toLocaleDateString(undefined, {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
          })
    }
  }
  return {
    usedPercent: Math.min(100, Math.max(0, raw.usedPercent)),
    windowMinutes: expectedWindowMinutes,
    resetsAt,
    resetDescription
  }
}

export function toBackendRpcRateWindow(
  raw: BackendRateLimitWindow | null | undefined,
  fallbackWindowMinutes: number
): CodexRpcRateWindow | null {
  if (!raw) {
    return null
  }
  const seconds = raw.limit_window_seconds
  const windowDurationMins =
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? Math.ceil(seconds / 60)
      : fallbackWindowMinutes
  return { usedPercent: raw.used_percent, windowDurationMins, resetsAt: raw.reset_at }
}

export function mapBackendUsageWindow(
  window: CodexRpcRateWindow | null,
  fallbackWindowMinutes: number
): RateLimitWindow | null {
  const duration = window?.windowDurationMins
  return mapRpcWindow(
    window,
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : fallbackWindowMinutes
  )
}
