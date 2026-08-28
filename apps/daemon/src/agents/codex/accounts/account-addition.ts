import { randomUUID } from 'node:crypto'

import type {
  CodexManagedAccount,
  CodexRateLimitAccountsState
} from '@yiru/runtime-protocol/workbench/types'

import type { CodexAccountState } from './account-state'
import type { ResolvedCodexIdentity } from './identity'
import type { CodexAccountLogin } from './login'
import type { CodexManagedConfig } from './managed-config'
import type { CodexAccountAddTarget, CodexManagedHome } from './managed-home'
import {
  getCodexSelectionTargetForAccount,
  getSelectedCodexAccountIdForTarget,
  normalizeCodexRuntimeSelection,
  setSelectedCodexAccountIdForTarget
} from './runtime-selection'

export async function addCodexAccount(
  state: CodexAccountState,
  login: CodexAccountLogin,
  homes: CodexManagedHome,
  config: CodexManagedConfig,
  target?: CodexAccountAddTarget
): Promise<CodexRateLimitAccountsState> {
  const accountId = randomUUID()
  const managedHome = homes.create(accountId, target)
  try {
    const canonicalConfig = config.readCanonicalForHome(managedHome.managedHomePath)
    config.assertOAuthAddAllowed(canonicalConfig)
    config.syncIntoSafely(managedHome.managedHomePath, accountId, canonicalConfig)
    await login.run(managedHome.managedHomePath)
    const trustedHome = homes.assertPath(managedHome.managedHomePath, accountId)
    const identity = state.identity.readFromHome(trustedHome)
    if (!identity.email) {
      throw new Error('Codex login completed, but Yiru could not resolve the account email.')
    }
    const now = Date.now()
    const account: CodexManagedAccount = {
      id: accountId,
      email: identity.email,
      managedHomePath: trustedHome,
      managedHomeRuntime: managedHome.managedHomeRuntime,
      wslDistro: managedHome.wslDistro,
      wslLinuxHomePath: managedHome.wslLinuxHomePath,
      providerAccountId: identity.providerAccountId,
      workspaceLabel: identity.workspaceLabel,
      workspaceAccountId: identity.workspaceAccountId,
      createdAt: now,
      updatedAt: now,
      lastAuthenticatedAt: now
    }
    const settings = state.store.getSettings()
    const selection = normalizeCodexRuntimeSelection(settings)
    const targetSelection = getCodexSelectionTargetForAccount(account)
    state.store.updateSettings({
      codexManagedAccounts: [...settings.codexManagedAccounts, account],
      activeCodexManagedAccountId: targetSelection.runtime === 'host' ? account.id : selection.host,
      activeCodexManagedAccountIdsByRuntime: setSelectedCodexAccountIdForTarget(
        selection,
        account.id,
        targetSelection
      )
    })
    config.syncAllSafely()
    state.runtimeHome.clearLastWrittenAuthJson(account.id)
    state.runtimeHome.syncForCurrentSelection()
    state.startQuotaRefresh(
      getSelectedCodexAccountIdForTarget(settings, targetSelection),
      targetSelection
    )
    return state.snapshot()
  } catch (error) {
    homes.remove(managedHome.managedHomePath, accountId)
    throw error
  }
}

export async function reauthenticateCodexAccount(
  state: CodexAccountState,
  login: CodexAccountLogin,
  homes: CodexManagedHome,
  config: CodexManagedConfig,
  accountId: string
): Promise<CodexRateLimitAccountsState> {
  const account = state.requireAccount(accountId)
  const managedHomePath = homes.ensureForReauthentication(account)
  const target = getCodexSelectionTargetForAccount(account)
  const selectedId = getSelectedCodexAccountIdForTarget(state.store.getSettings(), target)
  config.syncIntoSafely(managedHomePath, account.id)
  let identity: ResolvedCodexIdentity
  try {
    await login.run(managedHomePath)
    identity = state.identity.readFromHome(homes.assertPath(managedHomePath, account.id))
    if (!identity.email) {
      throw new Error('Codex login completed, but Yiru could not resolve the account email.')
    }
  } catch (error) {
    const current = state.store.getSettings()
    const restored = setSelectedCodexAccountIdForTarget(
      normalizeCodexRuntimeSelection(current),
      selectedId,
      target
    )
    state.store.updateSettings({
      activeCodexManagedAccountId: restored.host,
      activeCodexManagedAccountIdsByRuntime: restored
    })
    throw error
  }
  const email = identity.email
  const settings = state.store.getSettings()
  const now = Date.now()
  const activeSelection = setSelectedCodexAccountIdForTarget(
    normalizeCodexRuntimeSelection(settings),
    selectedId,
    target
  )
  state.store.updateSettings({
    codexManagedAccounts: settings.codexManagedAccounts.map((entry) =>
      entry.id === accountId
        ? {
            ...entry,
            email,
            providerAccountId: identity.providerAccountId,
            workspaceLabel: identity.workspaceLabel,
            workspaceAccountId: identity.workspaceAccountId,
            updatedAt: now,
            lastAuthenticatedAt: now
          }
        : entry
    ),
    activeCodexManagedAccountId: activeSelection.host,
    activeCodexManagedAccountIdsByRuntime: activeSelection
  })
  config.syncAllSafely()
  state.runtimeHome.clearLastWrittenAuthJson(accountId)
  state.runtimeHome.syncForCurrentSelection(target)
  state.startQuotaRefresh(undefined, target)
  return state.snapshot()
}
