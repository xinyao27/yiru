import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { getKeybindingPlatform, type KeybindingOverrides } from '~shared/keybindings'

export type KeybindingJsonObject = Record<string, unknown>

const FILE_VERSION = 1

export function isKeybindingJsonObject(value: unknown): value is KeybindingJsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function createEmptyKeybindingDocument(): KeybindingJsonObject {
  return {
    version: FILE_VERSION,
    keybindings: {},
    platforms: {
      darwin: {},
      linux: {},
      win32: {}
    }
  }
}

export function ensureKeybindingDocument(path: string): void {
  if (!existsSync(path)) {
    writeKeybindingJsonDocument(path, createEmptyKeybindingDocument())
  }
}

export function migrateLegacyKeybindingDocument(
  path: string,
  platform: NodeJS.Platform,
  legacyOverrides: KeybindingOverrides | undefined
): void {
  if (existsSync(path) || !legacyOverrides || Object.keys(legacyOverrides).length === 0) {
    return
  }
  const keybindingPlatform = getKeybindingPlatform(platform)
  const document = createEmptyKeybindingDocument()
  document.platforms = {
    darwin: {},
    linux: {},
    win32: {},
    [keybindingPlatform]: legacyOverrides
  }
  writeKeybindingJsonDocument(path, document)
}

export function readKeybindingJsonDocument(path: string): {
  exists: boolean
  document: KeybindingJsonObject | null
  error?: string
} {
  if (!existsSync(path)) {
    return { exists: false, document: createEmptyKeybindingDocument() }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!isKeybindingJsonObject(parsed)) {
      return { exists: true, document: null, error: 'Keybindings file must contain a JSON object.' }
    }
    return { exists: true, document: parsed }
  } catch (error) {
    return {
      exists: true,
      document: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function writeKeybindingJsonDocument(path: string, document: KeybindingJsonObject): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, path)
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) {
        unlinkSync(temporaryPath)
      }
    } catch {
      // Preserve the original write failure, which is more actionable.
    }
    throw error
  }
}
