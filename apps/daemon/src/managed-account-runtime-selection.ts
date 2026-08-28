// Why: Claude and Codex managed-account runtime selection run the identical
// host/WSL-distro targeting algorithm. This module holds that one
// implementation; the provider-specific `<provider>-accounts/runtime-selection.ts`
// files stay as thin adapters that bind their own GlobalSettings field names
// and account shapes onto it.

export type ManagedAccountRuntimeSelection = {
  host: string | null
  wsl: Record<string, string | null>
}

export type ManagedAccountSelectionTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

export type NormalizedManagedAccountSelectionTarget = {
  runtime: 'host' | 'wsl'
  wslDistro: string | null
}

export type ManagedAccountRuntimeSettings = {
  activeManagedAccountId: string | null
  activeManagedAccountIdsByRuntime?: ManagedAccountRuntimeSelection
}

// The minimal account shape the selection algorithm needs. Providers keep
// their own field names (e.g. managedAuthRuntime vs managedHomeRuntime) on
// their real account types and map into this shape at the adapter boundary.
export type ManagedAccountRuntimeInfo = {
  id: string
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

export function normalizeManagedAccountSelectionTarget(
  target?: ManagedAccountSelectionTarget | null
): NormalizedManagedAccountSelectionTarget {
  if (target?.runtime === 'wsl') {
    return {
      runtime: 'wsl',
      wslDistro: normalizeWslDistro(target.wslDistro)
    }
  }
  return { runtime: 'host', wslDistro: null }
}

export function normalizeManagedRuntimeSelection(
  settings: ManagedAccountRuntimeSettings
): ManagedAccountRuntimeSelection {
  return {
    host:
      settings.activeManagedAccountIdsByRuntime?.host ?? settings.activeManagedAccountId ?? null,
    wsl: { ...settings.activeManagedAccountIdsByRuntime?.wsl }
  }
}

export function getSelectedManagedAccountIdForTarget(
  settings: ManagedAccountRuntimeSettings,
  target?: ManagedAccountSelectionTarget | null
): string | null {
  const selection = normalizeManagedRuntimeSelection(settings)
  const normalizedTarget = normalizeManagedAccountSelectionTarget(target)
  if (normalizedTarget.runtime === 'host') {
    return selection.host
  }
  if (normalizedTarget.wslDistro) {
    return selection.wsl[getWslSelectionKey(normalizedTarget.wslDistro)] ?? null
  }
  const selectedIds = Array.from(new Set(Object.values(selection.wsl).filter(Boolean)))
  return (
    selection.wsl[getWslSelectionKey(null)] ?? (selectedIds.length === 1 ? selectedIds[0] : null)
  )
}

export function setSelectedManagedAccountIdForTarget(
  selection: ManagedAccountRuntimeSelection,
  accountId: string | null,
  target?: ManagedAccountSelectionTarget | null
): ManagedAccountRuntimeSelection {
  const normalizedTarget = normalizeManagedAccountSelectionTarget(target)
  if (normalizedTarget.runtime === 'host') {
    return { host: accountId, wsl: { ...selection.wsl } }
  }
  if (accountId === null && normalizedTarget.wslDistro === null) {
    return {
      host: selection.host,
      wsl: Object.fromEntries(Object.keys(selection.wsl).map((key) => [key, null]))
    }
  }
  return {
    host: selection.host,
    wsl: {
      ...selection.wsl,
      [getWslSelectionKey(normalizedTarget.wslDistro)]: accountId
    }
  }
}

export function removeManagedAccountIdFromSelection(
  selection: ManagedAccountRuntimeSelection,
  accountId: string
): ManagedAccountRuntimeSelection {
  const nextWsl: Record<string, string | null> = {}
  for (const [distro, selectedId] of Object.entries(selection.wsl)) {
    nextWsl[distro] = selectedId === accountId ? null : selectedId
  }
  return {
    host: selection.host === accountId ? null : selection.host,
    wsl: nextWsl
  }
}

export function pruneInvalidManagedRuntimeSelection(
  selection: ManagedAccountRuntimeSelection,
  accounts: ManagedAccountRuntimeInfo[]
): ManagedAccountRuntimeSelection {
  const hostAccount = selection.host
    ? accounts.find((account) => account.id === selection.host)
    : null
  const nextWsl: Record<string, string | null> = {}
  for (const [distroKey, accountId] of Object.entries(selection.wsl)) {
    if (!accountId) {
      nextWsl[distroKey] = null
      continue
    }
    const account = accounts.find((entry) => entry.id === accountId)
    nextWsl[distroKey] =
      account && account.runtime === 'wsl' && getWslSelectionKey(account.wslDistro) === distroKey
        ? accountId
        : null
  }
  return {
    host: hostAccount && hostAccount.runtime !== 'wsl' ? selection.host : null,
    wsl: nextWsl
  }
}

export function getManagedSelectionTargetForAccount(
  account: ManagedAccountRuntimeInfo
): ManagedAccountSelectionTarget {
  if (account.runtime === 'wsl') {
    return { runtime: 'wsl', wslDistro: account.wslDistro ?? null }
  }
  return { runtime: 'host' }
}

export function getWslSelectionKey(wslDistro: string | null | undefined): string {
  return normalizeWslDistro(wslDistro) ?? '__default__'
}

function normalizeWslDistro(wslDistro: string | null | undefined): string | null {
  const trimmed = wslDistro?.trim()
  return trimmed ? trimmed : null
}
