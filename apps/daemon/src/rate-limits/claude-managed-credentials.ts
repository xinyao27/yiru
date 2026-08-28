import { existsSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'

import {
  readManagedClaudeKeychainCredentials,
  writeManagedClaudeKeychainCredentials
} from '../agents/claude/accounts/keychain'
import {
  readClaudeManagedAuthFile,
  resolveOwnedClaudeManagedAuthPath,
  writeClaudeManagedAuthFile
} from '../agents/claude/accounts/managed-auth-path'
import type { ClaudeRuntimeAuthPreparation } from '../agents/claude/accounts/runtime-auth-service'

export type InactiveClaudeAccountInfo = {
  id: string
  managedAuthPath: string
  managedAuthRuntime?: 'host' | 'wsl'
  wslDistro?: string | null
  wslLinuxAuthPath?: string | null
}

export type ManagedCredentialsLocation =
  | { kind: 'keychain'; accountId: string; managedAuthPath: string }
  | { kind: 'file'; managedAuthPath: string }

// Why: resolves where an inactive account's credentials live without
// materializing them into the shared runtime location. Using
// ClaudeRuntimeAuthService would overwrite the active account's auth.
export function resolveManagedCredentialsLocation(
  account: InactiveClaudeAccountInfo
): ManagedCredentialsLocation | null {
  if (account.managedAuthRuntime === 'wsl') {
    const managedAuthPath = resolveOwnedWslClaudeManagedAuthPath(account)
    return managedAuthPath ? { kind: 'file', managedAuthPath } : null
  }
  const managedAuthPath = resolveOwnedClaudeManagedAuthPath(account.id, account.managedAuthPath, {
    adoptLegacyMarker: true
  })
  if (!managedAuthPath) {
    return null
  }
  // macOS stores host managed credentials in the Keychain; everything else
  // (and WSL, handled above) stores them as a file under the managed dir.
  if (process.platform === 'darwin') {
    return { kind: 'keychain', accountId: account.id, managedAuthPath }
  }
  return { kind: 'file', managedAuthPath }
}

export async function readManagedCredentialsJson(
  location: ManagedCredentialsLocation
): Promise<string | null> {
  try {
    if (location.kind === 'keychain') {
      return await readManagedClaudeKeychainCredentials(location.accountId)
    }
    return readClaudeManagedAuthFile(location.managedAuthPath, '.credentials.json')
  } catch {
    return null
  }
}

export async function writeManagedCredentialsJson(
  location: ManagedCredentialsLocation,
  credentialsJson: string
): Promise<void> {
  if (location.kind === 'keychain') {
    await writeManagedClaudeKeychainCredentials(location.accountId, credentialsJson)
    return
  }
  writeClaudeManagedAuthFile(location.managedAuthPath, '.credentials.json', credentialsJson)
}

function resolveOwnedWslClaudeManagedAuthPath(account: InactiveClaudeAccountInfo): string | null {
  if (process.platform !== 'win32') {
    return null
  }
  const wslInfo = parseWslUncPath(account.managedAuthPath)
  if (!wslInfo || (account.wslDistro && wslInfo.distro !== account.wslDistro)) {
    return null
  }
  const linuxPath = account.wslLinuxAuthPath ?? wslInfo.linuxPath
  if (
    !linuxPath.includes('/.local/share/yiru/claude-accounts/') ||
    !linuxPath.endsWith(`/${account.id}/auth`)
  ) {
    return null
  }
  try {
    const markerPath = path.join(account.managedAuthPath, '.yiru-managed-claude-auth')
    if (
      !existsSync(markerPath) ||
      lstatSync(markerPath).isSymbolicLink() ||
      readFileSync(markerPath, 'utf-8').trim() !== account.id
    ) {
      return null
    }
    return account.managedAuthPath
  } catch {
    return null
  }
}

export function getManagedUsagePanelAuthPreparation(
  account: InactiveClaudeAccountInfo,
  location: ManagedCredentialsLocation
): ClaudeRuntimeAuthPreparation | null {
  if (process.platform === 'win32') {
    return null
  }
  if (account.managedAuthRuntime === 'wsl') {
    if (!account.wslLinuxAuthPath || !account.wslDistro) {
      return null
    }
    return {
      configDir: location.managedAuthPath,
      runtime: 'wsl',
      wslDistro: account.wslDistro,
      wslLinuxConfigDir: account.wslLinuxAuthPath,
      envPatch: { CLAUDE_CONFIG_DIR: account.wslLinuxAuthPath },
      stripAuthEnv: true,
      provenance: `managed:${account.id}:inactive-preview`
    }
  }
  return {
    configDir: location.managedAuthPath,
    runtime: 'host',
    wslDistro: null,
    wslLinuxConfigDir: null,
    envPatch: { CLAUDE_CONFIG_DIR: location.managedAuthPath },
    stripAuthEnv: true,
    provenance: `managed:${account.id}:inactive-preview`
  }
}
