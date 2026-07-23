import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'

import type { GlobalSettings } from '../../shared/types'

export type PersistedFloatingWorkspaceSettingsDecodeResult = {
  settings: Pick<
    GlobalSettings,
    | 'floatingTerminalEnabled'
    | 'floatingTerminalDefaultedForAllUsers'
    | 'floatingTerminalCwd'
    | 'floatingTerminalTrustedCwds'
    | 'floatingTerminalCwdMigratedToAppWorkspace'
  >
  needsSave: boolean
}

function resolveWorkspacePath(input: string, homeDir: string, platform: NodeJS.Platform): string {
  const expanded =
    input === '~'
      ? homeDir
      : input.startsWith(`~${sep}`) || (platform === 'win32' && input.startsWith('~/'))
        ? join(homeDir, input.slice(2))
        : input
  return isAbsolute(expanded) ? resolve(expanded) : resolve(homeDir, expanded)
}

function canonicalizeDirectory(
  input: string,
  homeDir: string,
  platform: NodeJS.Platform
): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  try {
    const canonicalPath = resolve(realpathSync(resolveWorkspacePath(trimmed, homeDir, platform)))
    return statSync(canonicalPath).isDirectory() ? canonicalPath : null
  } catch {
    return null
  }
}

function normalizeTrustedDirectories(
  input: unknown,
  homeDir: string,
  platform: NodeJS.Platform
): { values: string[]; changed: boolean } {
  const rawValues = Array.isArray(input) ? input : []
  const values: string[] = []
  const seen = new Set<string>()
  let changed = input !== undefined && !Array.isArray(input)
  for (const rawValue of rawValues) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      changed = true
      continue
    }
    const normalized =
      canonicalizeDirectory(rawValue, homeDir, platform) ??
      resolveWorkspacePath(rawValue.trim(), homeDir, platform)
    if (seen.has(normalized)) {
      changed = true
      continue
    }
    seen.add(normalized)
    values.push(normalized)
    changed ||= rawValue !== normalized
  }
  return { values, changed }
}

export function decodePersistedFloatingWorkspaceSettings(
  value: Partial<GlobalSettings> | undefined,
  defaults: GlobalSettings,
  homeDir: string,
  platform: NodeJS.Platform
): PersistedFloatingWorkspaceSettingsDecodeResult {
  const settings = value ?? {}
  const defaultedForAllUsers = settings.floatingTerminalDefaultedForAllUsers === true
  const cwdMigrated = settings.floatingTerminalCwdMigratedToAppWorkspace === true
  const rawCwd = settings.floatingTerminalCwd
  const floatingTerminalCwd = cwdMigrated
    ? rawCwd || defaults.floatingTerminalCwd
    : rawCwd === undefined
      ? defaults.floatingTerminalCwd
      : rawCwd
  const trusted = normalizeTrustedDirectories(
    settings.floatingTerminalTrustedCwds,
    homeDir,
    platform
  )
  if (!cwdMigrated && typeof rawCwd === 'string' && rawCwd.trim() && rawCwd.trim() !== '~') {
    const canonical = canonicalizeDirectory(rawCwd, homeDir, platform)
    if (canonical && !trusted.values.includes(canonical)) {
      // Why: an explicit cwd in a pre-grant profile already represented user
      // intent, so migrate that one path into the trust list.
      trusted.values.push(canonical)
      trusted.changed = true
    }
  }

  return {
    settings: {
      floatingTerminalEnabled: defaultedForAllUsers
        ? (settings.floatingTerminalEnabled ?? true)
        : true,
      floatingTerminalDefaultedForAllUsers: true,
      floatingTerminalCwd,
      floatingTerminalTrustedCwds: trusted.values,
      floatingTerminalCwdMigratedToAppWorkspace: true
    },
    needsSave: !cwdMigrated || trusted.changed
  }
}
