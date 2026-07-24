import type { ClaudeManagedAccount } from '../../shared/types'
import { getClaudeWslSelectionKey } from './runtime-selection'

export type ClaudeAccountIdentityCandidate = {
  email: string | null
  organizationUuid: string | null
  managedAuthRuntime: 'host' | 'wsl'
  wslDistro: string | null
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

function normalizeOrganizationUuid(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function runtimeScopeKey(
  runtime: 'host' | 'wsl' | undefined,
  wslDistro: string | null | undefined
): string {
  // Why: legacy accounts predate runtime fields, so they belong to the host
  // bucket; WSL uses the same normalized distro buckets as account selection.
  const normalizedRuntime = runtime ?? 'host'
  return normalizedRuntime === 'wsl' ? `wsl:${getClaudeWslSelectionKey(wslDistro)}` : 'host'
}

// Why: one email can belong to multiple organizations and runtime auth stores;
// only the normalized email, organization, and host/WSL scope define a duplicate.
export function findDuplicateClaudeAccount(
  accounts: readonly ClaudeManagedAccount[],
  candidate: ClaudeAccountIdentityCandidate
): ClaudeManagedAccount | null {
  const email = normalizeEmail(candidate.email)
  if (!email) {
    return null
  }
  const organizationUuid = normalizeOrganizationUuid(candidate.organizationUuid)
  const scope = runtimeScopeKey(candidate.managedAuthRuntime, candidate.wslDistro)
  return (
    accounts.find(
      (account) =>
        normalizeEmail(account.email) === email &&
        normalizeOrganizationUuid(account.organizationUuid) === organizationUuid &&
        runtimeScopeKey(account.managedAuthRuntime, account.wslDistro) === scope
    ) ?? null
  )
}
