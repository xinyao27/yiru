import type {
  AccountsSnapshot,
  AccountsSubscriptionEvent,
  AccountsUnsubscribeInput,
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState,
  CodexRateLimitResetResult,
  GrokAccountStatus,
  RateLimitRuntimeTargetInput,
  RateLimitState,
  RefreshRateLimitsInput,
  RemoveAccountInput,
  SelectAccountInput
} from '@yiru/runtime-protocol/contract'
import { getGrokAccountStatus } from '~main/grok/accounts/status'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

// Why: monotonically increasing per-process counter avoids the Date.now()
// collision that fired when two near-simultaneous accounts.subscribe calls
// collided on the same millisecond and one evicted the other through
// registerSubscriptionCleanup's existing-key eviction path.
let accountsSubscriptionSeq = 0
const ACCOUNTS_LIST_REFRESH_BUDGET_MS = 15_000

export async function listRuntimeAccounts(
  _params: void,
  { runtime }: RpcContext
): Promise<AccountsSnapshot> {
  // Why: ensure the snapshot reflects the latest provider state before
  // returning. Desktop polling pauses when the window is unfocused and
  // inactive-account caches only fill on AccountsPane open, so without
  // this the mobile UI would render stale nulls / zeroes.
  // Why: inactive provider usage is fetched account-by-account. A large or
  // unreachable account set must not turn the unary list call into an unbounded
  // wait; the refresh continues filling the snapshot for the next poll.
  await waitForAccountRefreshBudget(runtime.refreshAccountsForMobile())
  return runtime.getAccountsSnapshot()
}

export function listCachedRuntimeClaudeAccounts(
  _params: void,
  { runtime }: RpcContext
): ClaudeRateLimitAccountsState {
  return runtime.listCachedClaudeAccounts()
}

export function listCachedRuntimeCodexAccounts(
  _params: void,
  { runtime }: RpcContext
): CodexRateLimitAccountsState {
  return runtime.listCachedCodexAccounts()
}

async function waitForAccountRefreshBudget(refresh: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  await Promise.race([
    refresh,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ACCOUNTS_LIST_REFRESH_BUDGET_MS)
      timer.unref()
    })
  ])
  if (timer) {
    clearTimeout(timer)
  }
}

export function selectRuntimeClaudeAccount(
  params: SelectAccountInput,
  { runtime }: RpcContext
): Promise<ClaudeRateLimitAccountsState> {
  return runtime.selectClaudeAccount(params.accountId, {
    runtime: params.runtime,
    wslDistro: params.wslDistro
  })
}

export function selectRuntimeCodexAccount(
  params: SelectAccountInput,
  { runtime }: RpcContext
): Promise<CodexRateLimitAccountsState> {
  return runtime.selectCodexAccount(params.accountId, {
    runtime: params.runtime,
    wslDistro: params.wslDistro
  })
}

export function removeRuntimeClaudeAccount(
  params: RemoveAccountInput,
  { runtime }: RpcContext
): Promise<ClaudeRateLimitAccountsState> {
  return runtime.removeClaudeAccount(params.accountId)
}

export function removeRuntimeCodexAccount(
  params: RemoveAccountInput,
  { runtime }: RpcContext
): Promise<CodexRateLimitAccountsState> {
  return runtime.removeCodexAccount(params.accountId)
}

export function unsubscribeRuntimeAccounts(
  params: AccountsUnsubscribeInput,
  { runtime }: RpcContext
): { unsubscribed: boolean } {
  runtime.cleanupSubscription(params.subscriptionId)
  return { unsubscribed: true }
}

export function refreshRuntimeRateLimits(
  params: RefreshRateLimitsInput,
  { runtime }: RpcContext
): Promise<RateLimitState> {
  return runtime.refreshRateLimits(params.cursorContext)
}

export function refreshRuntimeCodexRateLimitsForTarget(
  params: RateLimitRuntimeTargetInput,
  { runtime }: RpcContext
): Promise<RateLimitState> {
  return runtime.refreshCodexRateLimitsForTarget(params)
}

export function refreshRuntimeClaudeRateLimitsForTarget(
  params: RateLimitRuntimeTargetInput,
  { runtime }: RpcContext
): Promise<RateLimitState> {
  return runtime.refreshClaudeRateLimitsForTarget(params)
}

export function consumeRuntimeCodexRateLimitResetCredit(
  _params: void,
  { runtime }: RpcContext
): Promise<CodexRateLimitResetResult> {
  return runtime.consumeCodexRateLimitResetCredit()
}

export function fetchRuntimeInactiveClaudeRateLimitAccounts(
  _params: void,
  { runtime }: RpcContext
): Promise<void> {
  return runtime.fetchInactiveClaudeRateLimitAccounts()
}

export function fetchRuntimeInactiveCodexRateLimitAccounts(
  _params: void,
  { runtime }: RpcContext
): Promise<void> {
  return runtime.fetchInactiveCodexRateLimitAccounts()
}

export function refreshRuntimeGrokRateLimits(
  _params: void,
  { runtime }: RpcContext
): Promise<RateLimitState> {
  return runtime.refreshGrokRateLimits()
}

// Why: reads the Grok CLI's own `auth.json` off this host's disk — always the
// local host today, no runtime-target support, same as `getGrokAccountStatus`'s
// previous plain-IPC caller.
export function getRuntimeGrokAccountStatus(
  _params: void,
  _context: RpcContext
): GrokAccountStatus {
  return getGrokAccountStatus()
}

// Why: streaming counterpart so mobile usage bars refresh in place when the
// desktop's 5-minute rate-limit poll completes or when the user switches
// accounts on either side. Mirrors the notifications.subscribe pattern.
// Phase 6 D-stage — plain function with the emit-based streaming shape
// (`RuntimeOrpcStreamHandler`), called directly from orpc/router-direct.ts
// via `wireRuntimeStream` instead of through a `defineStreamingMethod` legacy
// registration (same split as settings-events.ts's streaming pilot).
export async function handleAccountsSubscribe(
  _params: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: AccountsSubscriptionEvent) => void
): Promise<void> {
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const unsubscribe = runtime.onAccountsChanged((snapshot) => {
      emit({ type: 'snapshot', snapshot })
    })

    // Why: scope the id by connectionId so two sockets from the same
    // device (host + accounts screen) cannot evict each other through
    // registerSubscriptionCleanup's "existing key" branch, and append a
    // per-process counter so two concurrent subscribes on the same
    // socket also can't collide.
    const seq = ++accountsSubscriptionSeq
    const subscriptionId = `accounts-${connectionId ?? 'inproc'}-${seq}`
    runtime.registerSubscriptionCleanup(
      subscriptionId,
      () => {
        if (closed) {
          return
        }
        closed = true
        removeAbortListener()
        unsubscribe()
        emit({ type: 'end' })
        resolve()
      },
      connectionId
    )
    removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
    if (closed) {
      return
    }

    // Why: emit the current snapshot synchronously so the phone has
    // something to render immediately, then refresh only stale data.
    // Connection cutovers replay this subscription and must not turn the
    // manual-force lane into an unbounded provider-fetch loop.
    emit({ type: 'ready', subscriptionId, snapshot: runtime.getAccountsSnapshot() })
    void runtime.refreshAccountsForMobileSubscriber()
  })
}
