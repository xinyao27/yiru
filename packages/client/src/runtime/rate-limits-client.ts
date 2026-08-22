import { useAppStore } from '~renderer/store'
import type {
  CodexRateLimitResetResult,
  CursorRateLimitRefreshContext,
  RateLimitRuntimeTarget,
  RateLimitState
} from '~shared/rate-limit-types'

import { callRuntimeOrpc, createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

const RATE_LIMIT_SNAPSHOT_TIMEOUT_MS = 15_000

export function getRateLimitsTarget(): RuntimeClientTarget {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

// Why: accounts.list forces provider refreshes and can block behind broken
// auth, while the removed preload read returned the current snapshot.
// The subscription's ready event preserves that immediate-read meaning.
export async function fetchRateLimitSnapshot(): Promise<RateLimitState> {
  const controller = new AbortController()
  const target = getRateLimitsTarget()
  let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
  try {
    connection = await createRuntimeOrpcClient(target, {
      signal: controller.signal,
      timeoutMs: RATE_LIMIT_SNAPSHOT_TIMEOUT_MS
    })
    const stream = await connection.client.accounts.subscribe(undefined, {
      signal: controller.signal
    })
    for await (const event of stream) {
      if (event.type === 'ready' || event.type === 'snapshot') {
        return event.snapshot.rateLimits
      }
      if (event.type === 'end') {
        break
      }
    }
    throw new Error('Rate-limit snapshot stream closed before its first snapshot.')
  } finally {
    // Why: oRPC encodes its abort frame asynchronously, so the connection must
    // detach that listener before the signal fires against a closed transport.
    connection?.close()
    controller.abort()
  }
}

export function refreshRateLimitSnapshot(
  cursorContext?: CursorRateLimitRefreshContext
): Promise<RateLimitState> {
  return callRuntimeOrpc(
    getRateLimitsTarget(),
    (client) => client.accounts.refresh,
    cursorContext ? { cursorContext } : {}
  )
}

export function refreshClaudeRateLimitTarget(
  target: RateLimitRuntimeTarget
): Promise<RateLimitState> {
  return callRuntimeOrpc(
    getRateLimitsTarget(),
    (client) => client.accounts.refreshClaudeForTarget,
    target
  )
}

export function refreshCodexRateLimitTarget(
  target: RateLimitRuntimeTarget
): Promise<RateLimitState> {
  return callRuntimeOrpc(
    getRateLimitsTarget(),
    (client) => client.accounts.refreshCodexForTarget,
    target
  )
}

export function consumeCodexRateLimitResetCredit(): Promise<CodexRateLimitResetResult> {
  return callRuntimeOrpc(
    getRateLimitsTarget(),
    (client) => client.accounts.consumeCodexResetCredit,
    undefined
  )
}

export function fetchInactiveClaudeRateLimitAccounts(): Promise<void> {
  return callRuntimeOrpc(
    getRateLimitsTarget(),
    (client) => client.accounts.fetchInactiveClaudeAccounts,
    undefined
  )
}

export function fetchInactiveCodexRateLimitAccounts(): Promise<void> {
  return callRuntimeOrpc(
    getRateLimitsTarget(),
    (client) => client.accounts.fetchInactiveCodexAccounts,
    undefined
  )
}

export function refreshGrokRateLimitSnapshot(): Promise<RateLimitState> {
  return callRuntimeOrpc(getRateLimitsTarget(), (client) => client.accounts.refreshGrok, undefined)
}
