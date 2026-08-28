import type { ProviderRateLimits } from '@yiru/runtime-protocol/workbench/rate-limit-types'

import { createCodexBackendRequestSignal, getCodexBackendAuthHeaders } from './codex-backend-auth'
import type { BackendUsageResponse } from './codex-rate-limit-contracts'
import { mapBackendUsageWindow, toBackendRpcRateWindow } from './codex-rate-limit-mapping'
import type { FetchCodexRateLimitsOptions } from './codex-rate-limit-options'
import {
  classifyCodexRateLimitWindows,
  CODEX_SESSION_WINDOW_MINUTES,
  CODEX_WEEKLY_WINDOW_MINUTES
} from './codex-rate-limit-window-classification'
import { mapBackendRateLimitResetCredits } from './codex-reset-credits'

export async function fetchCodexRateLimitsViaBackend(
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits | null> {
  const signal = createCodexBackendRequestSignal(options?.signal)
  const headers = await getCodexBackendAuthHeaders(options, signal)
  if (!headers || signal.aborted) {
    return null
  }
  const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
    headers,
    signal
  })
  if (!response.ok) {
    return null
  }
  const payload = (await response.json()) as BackendUsageResponse
  if (typeof payload.plan_type !== 'string') {
    return null
  }
  const classified = classifyCodexRateLimitWindows({
    primary: toBackendRpcRateWindow(
      payload.rate_limit?.primary_window,
      CODEX_SESSION_WINDOW_MINUTES
    ),
    secondary: toBackendRpcRateWindow(
      payload.rate_limit?.secondary_window,
      CODEX_WEEKLY_WINDOW_MINUTES
    )
  })
  return {
    provider: 'codex',
    session: mapBackendUsageWindow(classified.session, CODEX_SESSION_WINDOW_MINUTES),
    weekly: mapBackendUsageWindow(classified.weekly, CODEX_WEEKLY_WINDOW_MINUTES),
    planType: payload.plan_type,
    ...(payload.rate_limit_reset_credits !== undefined
      ? {
          rateLimitResetCredits:
            mapBackendRateLimitResetCredits(payload.rate_limit_reset_credits) ?? null
        }
      : {}),
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}
