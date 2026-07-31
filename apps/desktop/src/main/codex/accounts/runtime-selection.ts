import {
  getManagedSelectionTargetForAccount,
  getSelectedManagedAccountIdForTarget,
  normalizeManagedAccountSelectionTarget,
  normalizeManagedRuntimeSelection,
  pruneInvalidManagedRuntimeSelection,
  removeManagedAccountIdFromSelection,
  setSelectedManagedAccountIdForTarget,
  type ManagedAccountSelectionTarget,
  type NormalizedManagedAccountSelectionTarget
} from '~main/managed-account-runtime-selection'
import type {
  CodexManagedAccount,
  CodexManagedAccountRuntimeSelection,
  GlobalSettings
} from '~shared/types'

export { getWslSelectionKey } from '~main/managed-account-runtime-selection'

export type CodexAccountSelectionTarget = ManagedAccountSelectionTarget

export type NormalizedCodexAccountSelectionTarget = NormalizedManagedAccountSelectionTarget

export function normalizeCodexAccountSelectionTarget(
  target?: CodexAccountSelectionTarget | null
): NormalizedCodexAccountSelectionTarget {
  return normalizeManagedAccountSelectionTarget(target)
}

export function normalizeCodexRuntimeSelection(
  settings: Pick<
    GlobalSettings,
    'activeCodexManagedAccountId' | 'activeCodexManagedAccountIdsByRuntime'
  >
): CodexManagedAccountRuntimeSelection {
  return normalizeManagedRuntimeSelection({
    activeManagedAccountId: settings.activeCodexManagedAccountId,
    activeManagedAccountIdsByRuntime: settings.activeCodexManagedAccountIdsByRuntime
  })
}

export function getSelectedCodexAccountIdForTarget(
  settings: Pick<
    GlobalSettings,
    'activeCodexManagedAccountId' | 'activeCodexManagedAccountIdsByRuntime'
  >,
  target?: CodexAccountSelectionTarget | null
): string | null {
  return getSelectedManagedAccountIdForTarget(
    {
      activeManagedAccountId: settings.activeCodexManagedAccountId,
      activeManagedAccountIdsByRuntime: settings.activeCodexManagedAccountIdsByRuntime
    },
    target
  )
}

export function setSelectedCodexAccountIdForTarget(
  selection: CodexManagedAccountRuntimeSelection,
  accountId: string | null,
  target?: CodexAccountSelectionTarget | null
): CodexManagedAccountRuntimeSelection {
  return setSelectedManagedAccountIdForTarget(selection, accountId, target)
}

export function removeCodexAccountIdFromSelection(
  selection: CodexManagedAccountRuntimeSelection,
  accountId: string
): CodexManagedAccountRuntimeSelection {
  return removeManagedAccountIdFromSelection(selection, accountId)
}

export function pruneInvalidCodexRuntimeSelection(
  selection: CodexManagedAccountRuntimeSelection,
  accounts: CodexManagedAccount[]
): CodexManagedAccountRuntimeSelection {
  return pruneInvalidManagedRuntimeSelection(
    selection,
    accounts.map((account) => ({
      id: account.id,
      runtime: account.managedHomeRuntime,
      wslDistro: account.wslDistro
    }))
  )
}

export function getCodexSelectionTargetForAccount(
  account: CodexManagedAccount
): CodexAccountSelectionTarget {
  return getManagedSelectionTargetForAccount({
    id: account.id,
    runtime: account.managedHomeRuntime,
    wslDistro: account.wslDistro
  })
}
