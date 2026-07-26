import type {
  ClaudeManagedAccount,
  ClaudeManagedAccountRuntimeSelection,
  GlobalSettings
} from '../../../shared/types'
import {
  getManagedSelectionTargetForAccount,
  getSelectedManagedAccountIdForTarget,
  getWslSelectionKey,
  normalizeManagedAccountSelectionTarget,
  normalizeManagedRuntimeSelection,
  pruneInvalidManagedRuntimeSelection,
  removeManagedAccountIdFromSelection,
  setSelectedManagedAccountIdForTarget,
  type ManagedAccountSelectionTarget,
  type NormalizedManagedAccountSelectionTarget
} from '../../managed-account-runtime-selection'

export type ClaudeAccountSelectionTarget = ManagedAccountSelectionTarget

export type NormalizedClaudeAccountSelectionTarget = NormalizedManagedAccountSelectionTarget

export function normalizeClaudeAccountSelectionTarget(
  target?: ClaudeAccountSelectionTarget | null
): NormalizedClaudeAccountSelectionTarget {
  return normalizeManagedAccountSelectionTarget(target)
}

export function normalizeClaudeRuntimeSelection(
  settings: Pick<
    GlobalSettings,
    'activeClaudeManagedAccountId' | 'activeClaudeManagedAccountIdsByRuntime'
  >
): ClaudeManagedAccountRuntimeSelection {
  return normalizeManagedRuntimeSelection({
    activeManagedAccountId: settings.activeClaudeManagedAccountId,
    activeManagedAccountIdsByRuntime: settings.activeClaudeManagedAccountIdsByRuntime
  })
}

export function getSelectedClaudeAccountIdForTarget(
  settings: Pick<
    GlobalSettings,
    'activeClaudeManagedAccountId' | 'activeClaudeManagedAccountIdsByRuntime'
  >,
  target?: ClaudeAccountSelectionTarget | null
): string | null {
  return getSelectedManagedAccountIdForTarget(
    {
      activeManagedAccountId: settings.activeClaudeManagedAccountId,
      activeManagedAccountIdsByRuntime: settings.activeClaudeManagedAccountIdsByRuntime
    },
    target
  )
}

export function setSelectedClaudeAccountIdForTarget(
  selection: ClaudeManagedAccountRuntimeSelection,
  accountId: string | null,
  target?: ClaudeAccountSelectionTarget | null
): ClaudeManagedAccountRuntimeSelection {
  return setSelectedManagedAccountIdForTarget(selection, accountId, target)
}

export function removeClaudeAccountIdFromSelection(
  selection: ClaudeManagedAccountRuntimeSelection,
  accountId: string
): ClaudeManagedAccountRuntimeSelection {
  return removeManagedAccountIdFromSelection(selection, accountId)
}

export function pruneInvalidClaudeRuntimeSelection(
  selection: ClaudeManagedAccountRuntimeSelection,
  accounts: ClaudeManagedAccount[]
): ClaudeManagedAccountRuntimeSelection {
  return pruneInvalidManagedRuntimeSelection(
    selection,
    accounts.map((account) => ({
      id: account.id,
      runtime: account.managedAuthRuntime,
      wslDistro: account.wslDistro
    }))
  )
}

export function getClaudeSelectionTargetForAccount(
  account: ClaudeManagedAccount
): ClaudeAccountSelectionTarget {
  return getManagedSelectionTargetForAccount({
    id: account.id,
    runtime: account.managedAuthRuntime,
    wslDistro: account.wslDistro
  })
}

export function getClaudeWslSelectionKey(wslDistro: string | null | undefined): string {
  return getWslSelectionKey(wslDistro)
}
