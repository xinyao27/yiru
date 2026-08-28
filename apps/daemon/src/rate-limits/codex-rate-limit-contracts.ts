import type {
  CodexRpcRateLimits,
  CodexRpcRateLimitsByLimitId
} from './codex-rate-limit-window-classification'

export type RateLimitResetCredits = {
  availableCount: number
  totalEarnedCount?: number
  nextExpiresAt?: number | null
  credits?: {
    status: string
    expiresAt: number | null
    grantedAt: number | null
  }[]
}

export type RpcRateLimitsResponse = {
  rateLimits?: CodexRpcRateLimits | null
  rateLimitsByLimitId?: CodexRpcRateLimitsByLimitId | null
  rateLimitResetCredits?: {
    availableCount?: number
    totalEarnedCount?: number
    nextExpiresAt?: number | null
    credits?: {
      status?: string
      expiresAt?: number | string | null
      grantedAt?: number | string | null
    }[]
  } | null
}

export type BackendRateLimitResetCreditsResponse = {
  available_count?: number
  total_earned_count?: number
  credits?: {
    status?: string
    expires_at?: string | null
    granted_at?: string | null
  }[]
}

export type BackendRateLimitWindow = {
  used_percent?: number
  limit_window_seconds?: number
  reset_at?: number
}

export type BackendUsageResponse = {
  plan_type?: string
  rate_limit?: {
    primary_window?: BackendRateLimitWindow | null
    secondary_window?: BackendRateLimitWindow | null
  } | null
  rate_limit_reset_credits?: BackendRateLimitResetCreditsResponse | null
}
