import type { ClaudeRateLimitAccountsState } from '@yiru/runtime-protocol/workbench/types'

import type { ClaudeAccountState } from './account-state'
import type { ClaudeManagedAuthStorage } from './managed-auth-storage'
import {
  getClaudeSelectionTargetForAccount,
  getSelectedClaudeAccountIdForTarget,
  normalizeClaudeAccountSelectionTarget,
  normalizeClaudeRuntimeSelection,
  removeClaudeAccountIdFromSelection,
  setSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'

export async function removeClaudeAccount(
  state: ClaudeAccountState,
  storage: ClaudeManagedAuthStorage,
  accountId: string
): Promise<ClaudeRateLimitAccountsState> {
  const account = state.requireAccount(accountId)
  const settings = state.settings()
  const accountTarget = getClaudeSelectionTargetForAccount(account)
  const wasSelected = getSelectedClaudeAccountIdForTarget(settings, accountTarget) === accountId
  const nextAccounts = settings.claudeManagedAccounts.filter((entry) => entry.id !== accountId)
  const nextSelection = removeClaudeAccountIdFromSelection(
    normalizeClaudeRuntimeSelection(settings),
    accountId
  )
  const nextActiveId =
    settings.activeClaudeManagedAccountId === accountId ? null : nextSelection.host
  try {
    if (wasSelected) {
      state.updateSettings({
        activeClaudeManagedAccountId: nextActiveId,
        activeClaudeManagedAccountIdsByRuntime: nextSelection
      })
      await state.syncRuntime(accountTarget)
      state.updateSettings({ claudeManagedAccounts: nextAccounts })
    } else {
      state.updateSettings({
        claudeManagedAccounts: nextAccounts,
        activeClaudeManagedAccountId: nextActiveId,
        activeClaudeManagedAccountIdsByRuntime: nextSelection
      })
      await state.syncRuntime(accountTarget)
    }
    await storage.safeRemove(accountId, account.managedAuthPath)
    state.evictRateLimitCache(accountId)
    await state.refreshRateLimits(wasSelected ? accountId : undefined, accountTarget)
    return state.snapshot()
  } catch (error) {
    state.restoreSettings(settings)
    await state.forceRollback()
    throw error
  }
}

export async function selectClaudeAccount(
  state: ClaudeAccountState,
  accountId: string | null,
  target?: ClaudeAccountSelectionTarget
): Promise<ClaudeRateLimitAccountsState> {
  let effectiveTarget = target
  if (accountId !== null) {
    const accountTarget = getClaudeSelectionTargetForAccount(state.requireAccount(accountId))
    const requestedTarget = normalizeClaudeAccountSelectionTarget(target ?? accountTarget)
    const normalizedAccountTarget = normalizeClaudeAccountSelectionTarget(accountTarget)
    if (
      requestedTarget.runtime !== normalizedAccountTarget.runtime ||
      (requestedTarget.wslDistro !== null &&
        requestedTarget.wslDistro !== normalizedAccountTarget.wslDistro)
    ) {
      throw new Error('That Claude account belongs to a different runtime.')
    }
    effectiveTarget = accountTarget
  }
  const previousSettings = state.settings()
  const selection = normalizeClaudeRuntimeSelection(previousSettings)
  const outgoingAccountId = getSelectedClaudeAccountIdForTarget(previousSettings, effectiveTarget)
  const nextSelection = setSelectedClaudeAccountIdForTarget(selection, accountId, effectiveTarget)
  state.updateSettings({
    activeClaudeManagedAccountId:
      effectiveTarget?.runtime === 'wsl' ? nextSelection.host : accountId,
    activeClaudeManagedAccountIdsByRuntime: nextSelection
  })
  try {
    await state.syncRuntime(effectiveTarget)
    await state.refreshRateLimits(outgoingAccountId, effectiveTarget)
    return state.snapshot()
  } catch (error) {
    state.restoreSettings(previousSettings)
    await state.forceRollback()
    throw error
  }
}
