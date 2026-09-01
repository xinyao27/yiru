import { randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'

import { writeRollingFileBackup } from '../../rolling-file-backup'
import { renameFileWithWindowsRetry } from './accounts/atomic-file-operations'
import {
  removeHookTrustEntriesFromContent,
  upsertHookTrustEntriesInContent
} from './config-toml-hook-blocks'
import {
  createEmptyHookTrustEntryMap,
  readHookTrustEntriesFromContent
} from './config-toml-hook-reader'
import { upsertProjectTrustLevelInContent } from './config-toml-project-trust'
import type {
  CodexHookTrustState,
  CodexProjectTrustLevel,
  CodexTrustEntry
} from './config-toml-trust'

export function upsertHookTrustEntries(
  configPath: string,
  entries: readonly CodexTrustEntry[]
): void {
  updateConfigFile(configPath, (content) => upsertHookTrustEntriesInContent(content, entries))
}

export function upsertProjectTrustLevel(
  configPath: string,
  projectPath: string,
  trustLevel: CodexProjectTrustLevel
): void {
  updateConfigFile(configPath, (content) =>
    upsertProjectTrustLevelInContent(content, projectPath, trustLevel)
  )
}

export function removeHookTrustEntries(configPath: string, keys: readonly string[]): void {
  if (!existsSync(configPath)) {
    return
  }
  updateConfigFile(configPath, (content) => removeHookTrustEntriesFromContent(content, keys))
}

export function readHookTrustEntries(configPath: string): Map<string, CodexHookTrustState> {
  return existsSync(configPath)
    ? readHookTrustEntriesFromContent(readTomlFile(configPath))
    : createEmptyHookTrustEntryMap()
}

export function writeConfigAtomically(configPath: string, contents: string): void {
  let writePath = configPath
  let isSymlink = false
  try {
    isSymlink = lstatSync(configPath).isSymbolicLink()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  if (isSymlink) {
    // Why: renaming at the lexical path would replace the user's dotfiles link.
    writePath = realpathSync.native(configPath)
  }
  const directory = dirname(writePath)
  mkdirSync(directory, { recursive: true })
  const temporaryPath = join(directory, `.${Date.now()}-${randomUUID()}.tmp`)
  const existingMode = existsSync(writePath) ? statSync(writePath).mode : undefined
  let renamed = false
  try {
    writeFileSync(temporaryPath, contents, { encoding: 'utf-8', mode: existingMode })
    if (existsSync(writePath)) {
      writeRollingFileBackup(writePath, `${writePath}.bak`)
    }
    renameFileWithWindowsRetry(temporaryPath, writePath)
    renamed = true
  } finally {
    if (!renamed && existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath)
      } catch {
        // best effort — do not mask the original write failure
      }
    }
  }
}

function updateConfigFile(configPath: string, transform: (content: string) => string): void {
  const existing = existsSync(configPath) ? readTomlFile(configPath) : ''
  const updated = transform(existing)
  if (updated !== existing) {
    writeConfigAtomically(configPath, updated)
  }
}

function readTomlFile(configPath: string): string {
  const raw = readFileSync(configPath, 'utf-8')
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}
