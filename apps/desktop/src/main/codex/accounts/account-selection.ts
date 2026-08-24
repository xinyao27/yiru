import type { CodexRateLimitAccountsState } from '~shared/types'

import type { CodexAccountState } from './account-state'
import type { CodexManagedConfig } from './managed-config'
import type { CodexManagedHome } from './managed-home'
import {
  getCodexSelectionTargetForAccount,
  getSelectedCodexAccountIdForTarget,
  normalizeCodexAccountSelectionTarget,
  normalizeCodexRuntimeSelection,
  removeCodexAccountIdFromSelection,
  setSelectedCodexAccountIdForTarget,
  type CodexAccountSelectionTarget
} from './runtime-selection'

export async function removeCodexAccount(
  state: CodexAccountState,
  homes: CodexManagedHome,
  accountId: string
): Promise<CodexRateLimitAccountsState> {
  const account = state.requireAccount(accountId)
  const settings = state.store.getSettings()
  const nextSelection = removeCodexAccountIdFromSelection(
    normalizeCodexRuntimeSelection(settings),
    accountId
  )
  state.store.updateSettings({
    codexManagedAccounts: settings.codexManagedAccounts.filter((entry) => entry.id !== accountId),
    activeCodexManagedAccountId:
      settings.activeCodexManagedAccountId === accountId ? null : nextSelection.host,
    activeCodexManagedAccountIdsByRuntime: nextSelection
  })
  state.runtimeHome.syncForCurrentSelection()
  homes.remove(account.managedHomePath, account.id)
  state.rateLimits.evictInactiveCodexCache(accountId)
  const target = getCodexSelectionTargetForAccount(account)
  state.startQuotaRefresh(
    getSelectedCodexAccountIdForTarget(settings, target) === accountId ? accountId : undefined,
    target
  )
  return state.snapshot()
}

export async function selectCodexAccount(
  state: CodexAccountState,
  config: CodexManagedConfig,
  accountId: string | null,
  target?: CodexAccountSelectionTarget
): Promise<CodexRateLimitAccountsState> {
  let effectiveTarget = target
  if (accountId !== null) {
    const accountTarget = getCodexSelectionTargetForAccount(state.requireAccount(accountId))
    const requested = normalizeCodexAccountSelectionTarget(target ?? accountTarget)
    const normalizedAccountTarget = normalizeCodexAccountSelectionTarget(accountTarget)
    if (
      requested.runtime !== normalizedAccountTarget.runtime ||
      (requested.wslDistro !== null && requested.wslDistro !== normalizedAccountTarget.wslDistro)
    ) {
      throw new Error('That Codex account belongs to a different runtime.')
    }
    effectiveTarget = accountTarget
  }
  const previousSettings = state.store.getSettings()
  const outgoingId = getSelectedCodexAccountIdForTarget(previousSettings, effectiveTarget)
  const nextSelection = setSelectedCodexAccountIdForTarget(
    normalizeCodexRuntimeSelection(previousSettings),
    accountId,
    effectiveTarget
  )
  state.store.updateSettings({
    activeCodexManagedAccountId:
      effectiveTarget?.runtime === 'wsl' ? nextSelection.host : accountId,
    activeCodexManagedAccountIdsByRuntime: nextSelection
  })
  config.syncAllSafely()
  state.runtimeHome.syncForCurrentSelection(effectiveTarget)
  state.startQuotaRefresh(outgoingId, effectiveTarget)
  return state.snapshot()
}
