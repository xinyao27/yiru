import type {
  CodexRateLimitResetOutcome,
  ProviderRateLimits
} from '@yiru/runtime-protocol/workbench/rate-limit-types'

import { createCodexBackendRequestSignal, getCodexBackendAuthHeaders } from './codex-backend-auth'
import type {
  BackendRateLimitResetCreditsResponse,
  RateLimitResetCredits,
  RpcRateLimitsResponse
} from './codex-rate-limit-contracts'
import type { FetchCodexRateLimitsOptions } from './codex-rate-limit-options'

const REDEEM_BACKEND_TIMEOUT_MS = 30000

export function mapRpcRateLimitResetCredits(
  raw: RpcRateLimitsResponse['rateLimitResetCredits']
): RateLimitResetCredits | null | undefined {
  if (!raw) {
    return raw
  }
  if (typeof raw.availableCount !== 'number' || !Number.isFinite(raw.availableCount)) {
    return null
  }
  const credits = raw.credits?.map((credit) => ({
    status: normalizeCreditStatus(credit.status),
    expiresAt: parseCreditTimestamp(credit.expiresAt),
    grantedAt: parseCreditTimestamp(credit.grantedAt)
  }))
  return {
    availableCount: Math.max(0, Math.floor(raw.availableCount)),
    ...(typeof raw.totalEarnedCount === 'number' && Number.isFinite(raw.totalEarnedCount)
      ? { totalEarnedCount: Math.max(0, Math.floor(raw.totalEarnedCount)) }
      : {}),
    nextExpiresAt: parseCreditTimestamp(raw.nextExpiresAt) ?? getNextAvailableCreditExpiry(credits),
    ...(credits ? { credits } : {})
  }
}

export function mapBackendRateLimitResetCredits(
  raw: BackendRateLimitResetCreditsResponse | null | undefined
): RateLimitResetCredits | null | undefined {
  if (!raw) {
    return raw
  }
  const credits = raw.credits?.map((credit) => ({
    status: normalizeCreditStatus(credit.status),
    expiresAt: parseCreditTimestamp(credit.expires_at),
    grantedAt: parseCreditTimestamp(credit.granted_at)
  }))
  const availableCount =
    typeof raw.available_count === 'number' && Number.isFinite(raw.available_count)
      ? raw.available_count
      : (credits?.filter((credit) => credit.status === 'available').length ?? null)
  if (availableCount === null) {
    return null
  }
  return {
    availableCount: Math.max(0, Math.floor(availableCount)),
    ...(typeof raw.total_earned_count === 'number' && Number.isFinite(raw.total_earned_count)
      ? { totalEarnedCount: Math.max(0, Math.floor(raw.total_earned_count)) }
      : {}),
    nextExpiresAt: getNextAvailableCreditExpiry(credits),
    ...(credits ? { credits } : {})
  }
}

export async function withBackendRateLimitResetCredits(
  limits: ProviderRateLimits,
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits> {
  if (
    options?.signal?.aborted ||
    limits.provider !== 'codex' ||
    (limits.rateLimitResetCredits?.nextExpiresAt !== undefined &&
      limits.rateLimitResetCredits.nextExpiresAt !== null)
  ) {
    return limits
  }
  try {
    const credits = await fetchBackendRateLimitResetCredits(options)
    return credits === null ? limits : { ...limits, rateLimitResetCredits: credits }
  } catch {
    return limits
  }
}

export async function consumeCodexRateLimitResetCredit(options: {
  codexHomePath?: string | null
  idempotencyKey: string
}): Promise<CodexRateLimitResetOutcome> {
  if (!options.idempotencyKey.trim()) {
    throw new Error('Codex reset idempotency key is required')
  }
  const signal = createCodexBackendRequestSignal(undefined, REDEEM_BACKEND_TIMEOUT_MS)
  const headers = await getCodexBackendAuthHeaders(options, signal)
  if (!headers) {
    throw new Error('Codex not signed in')
  }
  const response = await fetch(
    'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ redeem_request_id: options.idempotencyKey }),
      signal
    }
  )
  if (!response.ok) {
    throw new Error(`Codex reset failed: HTTP ${response.status}`)
  }
  const payload = (await response.json()) as { code?: string }
  return mapBackendConsumeOutcome(payload.code)
}

async function fetchBackendRateLimitResetCredits(
  options?: FetchCodexRateLimitsOptions
): Promise<RateLimitResetCredits | null> {
  if (options?.signal?.aborted) {
    return null
  }
  const signal = createCodexBackendRequestSignal(options?.signal)
  const headers = await getCodexBackendAuthHeaders(options, signal)
  if (!headers || signal.aborted) {
    return null
  }
  const response = await fetch('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', {
    headers,
    signal
  })
  if (!response.ok) {
    return null
  }
  return (
    mapBackendRateLimitResetCredits(
      (await response.json()) as BackendRateLimitResetCreditsResponse
    ) ?? null
  )
}

function parseCreditTimestamp(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10000000000 ? value * 1000 : value
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  const numeric = Number(value.trim())
  if (Number.isFinite(numeric)) {
    return numeric < 10000000000 ? numeric * 1000 : numeric
  }
  const timestamp = Date.parse(value.trim())
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeCreditStatus(status: string | undefined): string {
  return status?.toLowerCase() ?? 'unknown'
}

function getNextAvailableCreditExpiry(
  credits: RateLimitResetCredits['credits'] | undefined
): number | null {
  const expiries =
    credits
      ?.filter((credit) => credit.status === 'available')
      .map((credit) => credit.expiresAt)
      .filter((expiresAt): expiresAt is number => typeof expiresAt === 'number')
      .sort((left, right) => left - right) ?? []
  return expiries[0] ?? null
}

function mapBackendConsumeOutcome(code: string | undefined): CodexRateLimitResetOutcome {
  if (code === 'reset') {
    return 'reset'
  }
  if (code === 'nothing_to_reset') {
    return 'nothingToReset'
  }
  if (code === 'no_credit') {
    return 'noCredit'
  }
  if (code === 'already_redeemed') {
    return 'alreadyRedeemed'
  }
  throw new Error(`Unknown Codex reset outcome: ${code ?? 'missing'}`)
}
