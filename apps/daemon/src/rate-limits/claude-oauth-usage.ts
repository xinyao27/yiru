import type {
  ProviderRateLimits,
  RateLimitWindow
} from '@yiru/runtime-protocol/workbench/rate-limit-types'
import { fetchHttp } from '~main/network/http-fetch'

import { createOAuthUsageError } from './claude-oauth-usage-error'

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const OAUTH_BETA_HEADER = 'oauth-2025-04-20'
const CLAUDE_CODE_USER_AGENT = 'claude-code/2.1.0'
const API_TIMEOUT_MS = 10_000

type OAuthUsageWindow = {
  utilization?: number
  used_percentage?: number
  resets_at?: string | number
}

type OAuthUsageLimit = {
  kind?: string
  percent?: number
  resets_at?: string | number
  is_active?: boolean
  scope?: { model?: { display_name?: string } | null } | null
}

type OAuthUsageResponse = {
  five_hour?: OAuthUsageWindow
  seven_day?: OAuthUsageWindow
  fable_weekly?: OAuthUsageWindow
  fable_seven_day?: OAuthUsageWindow
  seven_day_fable?: OAuthUsageWindow
  limits?: OAuthUsageLimit[] | null
}

export function abortedClaudeRateLimitResult(): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: 'Rate-limit fetch aborted',
    status: 'error'
  }
}

function parseResetTimestamp(value: string | number | undefined): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null
    }
    return value > 10_000_000_000 ? value : value * 1000
  }

  if (!value) {
    return null
  }

  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && value.trim() !== '') {
    return numericValue > 10_000_000_000 ? numericValue : numericValue * 1000
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

function parseResetDescription(resetValue: string | number | undefined): string | null {
  const resetTimestamp = parseResetTimestamp(resetValue)
  if (resetTimestamp === null) {
    return null
  }
  try {
    const date = new Date(resetTimestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return null
  }
}

function mapWindow(
  raw: OAuthUsageWindow | undefined,
  windowMinutes: number
): RateLimitWindow | null {
  if (!raw) {
    return null
  }
  const usedPercent =
    typeof raw.utilization === 'number'
      ? raw.utilization
      : typeof raw.used_percentage === 'number'
        ? raw.used_percentage
        : null
  if (usedPercent === null) {
    return null
  }
  return {
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    windowMinutes,
    resetsAt: parseResetTimestamp(raw.resets_at),
    resetDescription: parseResetDescription(raw.resets_at)
  }
}

function mapFableWeeklyWindow(data: OAuthUsageResponse): RateLimitWindow | null {
  // Why: model quotas moved into structured scoped limits; prefer that current
  // contract while retaining explicit legacy weekly fields for older responses.
  const scoped = Array.isArray(data.limits)
    ? data.limits.find(
        (limit) =>
          limit?.kind === 'weekly_scoped' &&
          limit.is_active !== false &&
          Number.isFinite(limit.percent) &&
          limit.scope?.model?.display_name?.trim().toLowerCase() === 'fable'
      )
    : undefined
  return (
    mapWindow(
      scoped ? { used_percentage: scoped.percent, resets_at: scoped.resets_at } : undefined,
      10080
    ) ??
    mapWindow(data.fable_weekly, 10080) ??
    mapWindow(data.fable_seven_day, 10080) ??
    mapWindow(data.seven_day_fable, 10080)
  )
}

export async function fetchViaOAuth(
  token: string,
  signal?: AbortSignal
): Promise<ProviderRateLimits> {
  if (signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }
  if (signal?.aborted) {
    return abortedClaudeRateLimitResult()
  }

  // Compose the caller's cancel signal with the request timeout so a timeout
  // and an external cancel both abort the fetch.
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)])
    : AbortSignal.timeout(API_TIMEOUT_MS)

  try {
    // Why: Electron injects its configured Chromium network stack for proxy and
    // certificate behavior; the pure Node runtime host uses its native fetch.
    const res = await fetchHttp(OAUTH_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': OAUTH_BETA_HEADER,
        // Why: Claude's OAuth usage endpoint is the Claude Code usage API;
        // matching the CLI user-agent keeps Yiru aligned with that contract.
        'User-Agent': CLAUDE_CODE_USER_AGENT
      },
      signal: requestSignal
    })

    if (!res.ok) {
      throw await createOAuthUsageError(res)
    }

    const data = (await res.json()) as OAuthUsageResponse
    if (signal?.aborted) {
      return abortedClaudeRateLimitResult()
    }

    return {
      provider: 'claude',
      session: mapWindow(data.five_hour, 300),
      weekly: mapWindow(data.seven_day, 10080),
      fableWeekly: mapFableWeeklyWindow(data),
      updatedAt: Date.now(),
      error: null,
      status: 'ok'
    }
  } catch (err) {
    if (signal?.aborted) {
      return abortedClaudeRateLimitResult()
    }
    throw err
  }
}
