import { randomUUID } from 'node:crypto'

import type { ClaudeManagedAccount, ClaudeRateLimitAccountsState } from '~shared/types'

import type { ClaudeAccountState } from './account-state'
import { findDuplicateClaudeAccount } from './claude-duplicate-account'
import type { ClaudeAccountLogin } from './login'
import type { ClaudeAccountAddTarget, ClaudeManagedAuthStorage } from './managed-auth-storage'
import {
  getClaudeSelectionTargetForAccount,
  normalizeClaudeRuntimeSelection
} from './runtime-selection'

export async function addClaudeAccount(
  state: ClaudeAccountState,
  login: ClaudeAccountLogin,
  storage: ClaudeManagedAuthStorage,
  target?: ClaudeAccountAddTarget
): Promise<ClaudeRateLimitAccountsState> {
  const accountId = randomUUID()
  const managedAuth = storage.create(accountId, target)
  const previousSettings = state.settings()
  let duplicateIdentityFound = false
  try {
    const captured = await login.run(managedAuth)
    if (!captured.identity.email) {
      throw new Error('Claude login completed, but Yiru could not resolve the account email.')
    }
    if (
      findDuplicateClaudeAccount(previousSettings.claudeManagedAccounts, {
        email: captured.identity.email,
        organizationUuid: captured.identity.organizationUuid,
        managedAuthRuntime: managedAuth.managedAuthRuntime,
        wslDistro: managedAuth.wslDistro
      })
    ) {
      duplicateIdentityFound = true
      throw new Error('This Claude account is already added.')
    }
    await storage.writeAuth(accountId, managedAuth.managedAuthPath, captured)
    const now = Date.now()
    const account: ClaudeManagedAccount = {
      id: accountId,
      email: captured.identity.email,
      managedAuthPath: managedAuth.managedAuthPath,
      managedAuthRuntime: managedAuth.managedAuthRuntime,
      wslDistro: managedAuth.wslDistro,
      wslLinuxAuthPath: managedAuth.wslLinuxAuthPath,
      authMethod: 'subscription-oauth',
      organizationUuid: captured.identity.organizationUuid,
      organizationName: captured.identity.organizationName,
      createdAt: now,
      updatedAt: now,
      lastAuthenticatedAt: now
    }
    const selection = normalizeClaudeRuntimeSelection(previousSettings)
    state.updateSettings({
      claudeManagedAccounts: [...previousSettings.claudeManagedAccounts, account],
      activeClaudeManagedAccountId: selection.host,
      activeClaudeManagedAccountIdsByRuntime: selection
    })
    state.clearLastWrittenCredentials(accountId)
    state.evictRateLimitCache(accountId)
    return state.snapshot()
  } catch (error) {
    if (!duplicateIdentityFound) {
      state.restoreSettings(previousSettings)
      await state.forceRollback()
    }
    await storage.safeRemove(accountId, managedAuth.managedAuthPath)
    throw error
  }
}

export async function reauthenticateClaudeAccount(
  state: ClaudeAccountState,
  login: ClaudeAccountLogin,
  storage: ClaudeManagedAuthStorage,
  accountId: string
): Promise<ClaudeRateLimitAccountsState> {
  const account = state.requireAccount(accountId)
  const managedAuthPath = storage.resolvePath(account.managedAuthPath, accountId)
  const previousSettings = state.settings()
  const previousAuth = await storage.readSnapshot(accountId, managedAuthPath)
  const captured = await login.run({
    managedAuthPath,
    managedAuthRuntime: account.managedAuthRuntime ?? 'host',
    wslDistro: account.wslDistro ?? null,
    wslLinuxAuthPath: account.wslLinuxAuthPath ?? null
  })
  if (!captured.identity.email) {
    throw new Error('Claude login completed, but Yiru could not resolve the account email.')
  }
  const email = captured.identity.email
  const settings = state.settings()
  const now = Date.now()
  const nextAccounts = settings.claudeManagedAccounts.map((entry) =>
    entry.id === accountId
      ? {
          ...entry,
          email,
          organizationUuid: captured.identity.organizationUuid,
          organizationName: captured.identity.organizationName,
          updatedAt: now,
          lastAuthenticatedAt: now
        }
      : entry
  )
  let wroteCredentials = false
  try {
    await storage.writeOauthAccount(accountId, managedAuthPath, captured.oauthAccount)
    await storage.writeCredentials(accountId, managedAuthPath, captured.credentialsJson)
    wroteCredentials = true
    state.updateSettings({ claudeManagedAccounts: nextAccounts })
    state.clearLastWrittenCredentials(accountId)
    state.evictRateLimitCache(accountId)
    const target = getClaudeSelectionTargetForAccount(account)
    await state.syncRuntime(target)
    await state.refreshRateLimits(undefined, target)
    return state.snapshot()
  } catch (error) {
    let restoredCredentials = false
    try {
      await storage.restoreCredentials(accountId, managedAuthPath, previousAuth)
      restoredCredentials = true
    } catch (rollbackError) {
      console.warn(
        '[claude-accounts] Failed to restore managed credentials during rollback:',
        rollbackError
      )
    }
    if (restoredCredentials || !wroteCredentials) {
      try {
        storage.restoreOauth(accountId, managedAuthPath, previousAuth)
      } catch (rollbackError) {
        console.warn(
          '[claude-accounts] Failed to restore managed oauth metadata during rollback:',
          rollbackError
        )
      }
    }
    if (restoredCredentials) {
      state.restoreSettings(previousSettings)
      await state.forceRollback()
    } else if (wroteCredentials) {
      state.updateSettings({ claudeManagedAccounts: nextAccounts })
    } else {
      state.restoreSettings(previousSettings)
    }
    throw error
  }
}
