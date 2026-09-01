import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import type { ProviderRateLimits } from '@yiru/runtime-protocol/workbench/rate-limit-types'

import { withMacTailscaleDnsHint } from '../network/macos-tailscale-dns-diagnostic'
import { probeCodexAuthPresence } from './codex-auth-presence'
import { fetchCodexRateLimitsViaBackend } from './codex-backend-fetch'
import { abortedCodexRateLimitResult } from './codex-rate-limit-mapping'
import type { FetchCodexRateLimitsOptions } from './codex-rate-limit-options'
import { withBackendRateLimitResetCredits } from './codex-reset-credits'
import { fetchCodexRateLimitsViaRpc } from './codex-rpc-fetch'

export { consumeCodexRateLimitResetCredit } from './codex-reset-credits'
export type { FetchCodexRateLimitsOptions } from './codex-rate-limit-options'

export async function fetchCodexRateLimits(
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits> {
  if (options?.signal?.aborted) {
    return abortedCodexRateLimitResult()
  }
  const authPresence = await probeCodexAuthPresence(options?.codexHomePath, {
    signal: options?.signal
  })
  if (options?.signal?.aborted) {
    return abortedCodexRateLimitResult()
  }
  if (authPresence === 'absent') {
    return unavailableResult('Codex not signed in')
  }
  if (authPresence !== 'present') {
    return errorResult(
      authPresence === 'timeout'
        ? 'Timed out while checking Codex sign-in status'
        : 'Codex sign-in status is unavailable'
    )
  }

  if (options?.codexHomePath && parseWslUncPath(options.codexHomePath)) {
    try {
      const backendResult = await fetchCodexRateLimitsViaBackend(options)
      if (options.signal?.aborted) {
        return abortedCodexRateLimitResult()
      }
      if (backendResult) {
        return addResetCreditsUnlessAborted(backendResult, options)
      }
    } catch {
      if (options.signal?.aborted) {
        return abortedCodexRateLimitResult()
      }
    }
  }

  try {
    const rpcResult = await fetchCodexRateLimitsViaRpc(options)
    if (options?.signal?.aborted) {
      return abortedCodexRateLimitResult()
    }
    return rpcResult.status === 'ok' || rpcResult.status === 'unavailable'
      ? addResetCreditsUnlessAborted(rpcResult, options)
      : rpcResult
  } catch (error) {
    if (options?.signal?.aborted) {
      return abortedCodexRateLimitResult()
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return message.includes('ENOENT')
      ? unavailableResult('Codex CLI not found')
      : errorResult(withMacTailscaleDnsHint(message))
  }
}

async function addResetCreditsUnlessAborted(
  limits: ProviderRateLimits,
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits> {
  const withCredits = await withBackendRateLimitResetCredits(limits, options)
  return options?.signal?.aborted ? abortedCodexRateLimitResult() : withCredits
}

function unavailableResult(error: string): ProviderRateLimits {
  return {
    provider: 'codex',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error,
    status: 'unavailable'
  }
}

function errorResult(error: string): ProviderRateLimits {
  return {
    provider: 'codex',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error,
    status: 'error'
  }
}
