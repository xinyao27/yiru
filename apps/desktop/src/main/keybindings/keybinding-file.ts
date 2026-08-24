import { join } from 'node:path'

import {
  findKeybindingConflicts,
  formatKeybindingList,
  getKeybindingDefinition,
  getKeybindingPlatform,
  isKeybindingActionId,
  normalizeKeybindingArrayForAction,
  normalizeKeybindingListForAction,
  type KeybindingActionId,
  type KeybindingFileDiagnostic,
  type KeybindingFileSnapshot,
  type KeybindingOverrides,
  type KeybindingPlatform
} from '~shared/keybindings'

import {
  isKeybindingJsonObject,
  readKeybindingJsonDocument,
  writeKeybindingJsonDocument,
  type KeybindingJsonObject
} from './keybinding-document'

const PLATFORM_KEYS: readonly KeybindingPlatform[] = ['darwin', 'linux', 'win32']
const ROOT_KEYS = new Set(['$schema', 'version', 'keybindings', 'platforms'])

export function getUserKeybindingsPath(homePath: string): string {
  return join(homePath, '.yiru', 'keybindings.json')
}

function normalizeBindingValue(
  actionId: KeybindingActionId,
  value: unknown
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === null || value === false) {
    return { ok: true, value: [] }
  }
  if (typeof value === 'string') {
    const normalized = normalizeKeybindingListForAction(actionId, value)
    return Array.isArray(normalized)
      ? { ok: true, value: normalized }
      : normalized.ok
        ? { ok: true, value: [normalized.value] }
        : normalized
  }
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === 'string')) {
      return { ok: false, error: 'Use a string, string array, null, or false.' }
    }
    const normalized = normalizeKeybindingArrayForAction(actionId, value)
    return Array.isArray(normalized)
      ? { ok: true, value: normalized }
      : normalized.ok
        ? { ok: true, value: [normalized.value] }
        : normalized
  }
  return { ok: false, error: 'Use a string, string array, null, or false.' }
}

function normalizeWriteBindingValue(actionId: KeybindingActionId, value: unknown): string[] | null {
  if (value === null) {
    return null
  }
  if (!Array.isArray(value) || !value.every((binding) => typeof binding === 'string')) {
    throw new Error('Use a string array or null.')
  }
  const normalized = normalizeKeybindingArrayForAction(actionId, value)
  if (!Array.isArray(normalized)) {
    throw new Error(normalized.ok ? 'Unable to parse shortcut.' : normalized.error)
  }
  return normalized
}

function parseBindingSection(
  value: unknown,
  section: string,
  diagnostics: KeybindingFileDiagnostic[],
  options: { skipRootKeys?: boolean } = {}
): KeybindingOverrides {
  if (value === undefined) {
    return {}
  }
  if (!isKeybindingJsonObject(value)) {
    diagnostics.push({
      severity: 'error',
      section,
      message: `${section} must be an object.`
    })
    return {}
  }

  const overrides: KeybindingOverrides = {}
  for (const [actionId, rawBinding] of Object.entries(value)) {
    if (options.skipRootKeys && ROOT_KEYS.has(actionId)) {
      continue
    }
    if (!isKeybindingActionId(actionId)) {
      diagnostics.push({
        severity: 'warning',
        section,
        actionId,
        message: `Unknown keybinding action "${actionId}" was ignored.`
      })
      continue
    }
    const normalized = normalizeBindingValue(actionId, rawBinding)
    if (!normalized.ok) {
      diagnostics.push({
        severity: 'error',
        section,
        actionId,
        message: `Shortcut for "${actionId}" was ignored: ${normalized.error}`
      })
      continue
    }
    overrides[actionId] = normalized.value
  }
  return overrides
}

function parsePlatformOverrides(
  document: KeybindingJsonObject,
  diagnostics: KeybindingFileDiagnostic[]
): Partial<Record<KeybindingPlatform, KeybindingOverrides>> {
  const rawPlatforms = document.platforms
  if (rawPlatforms === undefined) {
    return {}
  }
  if (!isKeybindingJsonObject(rawPlatforms)) {
    diagnostics.push({
      severity: 'error',
      section: 'platforms',
      message: 'platforms must be an object with darwin, linux, or win32 sections.'
    })
    return {}
  }

  const result: Partial<Record<KeybindingPlatform, KeybindingOverrides>> = {}
  for (const [platform, value] of Object.entries(rawPlatforms)) {
    if (!PLATFORM_KEYS.includes(platform as KeybindingPlatform)) {
      diagnostics.push({
        severity: 'warning',
        section: `platforms.${platform}`,
        message: `Unknown platform "${platform}" was ignored.`
      })
      continue
    }
    result[platform as KeybindingPlatform] = parseBindingSection(
      value,
      `platforms.${platform}`,
      diagnostics
    )
  }
  return result
}

function removeConflictingOverrides(
  platform: KeybindingPlatform,
  overrides: KeybindingOverrides,
  diagnostics: KeybindingFileDiagnostic[]
): KeybindingOverrides {
  let next = { ...overrides }
  for (let attempt = 0; attempt < 20; attempt++) {
    const conflicts = findKeybindingConflicts(platform, next)
    const conflictingOverrides = new Set<KeybindingActionId>()

    for (const conflict of conflicts) {
      for (const actionId of conflict.actionIds) {
        if (Object.prototype.hasOwnProperty.call(next, actionId)) {
          conflictingOverrides.add(actionId)
        }
      }
    }

    if (conflictingOverrides.size === 0) {
      return next
    }

    for (const actionId of conflictingOverrides) {
      delete next[actionId]
    }

    diagnostics.push({
      severity: 'error',
      message: `Conflicting custom shortcuts were ignored: ${Array.from(conflictingOverrides)
        .map((actionId) => getKeybindingDefinition(actionId)?.title ?? actionId)
        .join(', ')}.`
    })
  }
  return next
}

export function readKeybindingFile(
  path: string,
  platform: NodeJS.Platform = process.platform
): KeybindingFileSnapshot {
  const keybindingPlatform = getKeybindingPlatform(platform)
  const diagnostics: KeybindingFileDiagnostic[] = []
  const readResult = readKeybindingJsonDocument(path)
  if (!readResult.document) {
    return {
      path,
      platform: keybindingPlatform,
      exists: readResult.exists,
      overrides: {},
      commonOverrides: {},
      platformOverrides: {},
      diagnostics: [
        {
          severity: 'error',
          message: `Could not read keybindings file: ${readResult.error ?? 'unknown error'}`
        }
      ]
    }
  }

  const document = readResult.document
  const commonOverrides =
    document.keybindings === undefined
      ? parseBindingSection(document, 'root', diagnostics, { skipRootKeys: true })
      : parseBindingSection(document.keybindings, 'keybindings', diagnostics)
  const platformOverrides = parsePlatformOverrides(document, diagnostics)
  const mergedOverrides = {
    ...commonOverrides,
    ...platformOverrides[keybindingPlatform]
  }
  const overrides = removeConflictingOverrides(keybindingPlatform, mergedOverrides, diagnostics)

  return {
    path,
    platform: keybindingPlatform,
    exists: readResult.exists,
    overrides,
    commonOverrides,
    platformOverrides,
    diagnostics
  }
}

export function writeKeybindingOverride(
  path: string,
  platform: NodeJS.Platform,
  actionId: string,
  bindings: unknown
): KeybindingFileSnapshot {
  if (!isKeybindingActionId(actionId)) {
    throw new Error(`Unknown keybinding action "${actionId}".`)
  }
  const normalizedBindings = normalizeWriteBindingValue(actionId, bindings)

  const keybindingPlatform = getKeybindingPlatform(platform)
  const currentSnapshot = readKeybindingFile(path, platform)
  const candidateOverrides = { ...currentSnapshot.overrides }
  if (normalizedBindings === null) {
    delete candidateOverrides[actionId]
  } else {
    candidateOverrides[actionId] = normalizedBindings
  }
  const blockingConflict = findKeybindingConflicts(keybindingPlatform, candidateOverrides).find(
    (conflict) => conflict.actionIds.includes(actionId)
  )
  if (blockingConflict) {
    throw new Error(
      `${formatKeybindingList([blockingConflict.binding], keybindingPlatform)} conflicts with another shortcut.`
    )
  }

  const readResult = readKeybindingJsonDocument(path)
  if (!readResult.document) {
    throw new Error(readResult.error ?? 'Could not read keybindings file.')
  }

  const document = { ...readResult.document }
  const common = isKeybindingJsonObject(document.keybindings)
    ? { ...document.keybindings }
    : { ...currentSnapshot.commonOverrides }
  for (const rootKey of Object.keys(document)) {
    if (isKeybindingActionId(rootKey)) {
      delete document[rootKey]
    }
  }
  const platforms = isKeybindingJsonObject(document.platforms) ? { ...document.platforms } : {}
  const platformBindings = platforms[keybindingPlatform]
  const activePlatform = isKeybindingJsonObject(platformBindings) ? { ...platformBindings } : {}

  if (normalizedBindings === null) {
    // Why: Settings edits are scoped to the current platform. A hand-authored
    // common binding may be intentional for other OSes, so reset only removes
    // the platform-specific mask instead of deleting the shared value.
    delete activePlatform[actionId]
  } else {
    activePlatform[actionId] = normalizedBindings
  }

  document.version = 1
  document.keybindings = common
  document.platforms = {
    ...platforms,
    darwin: isKeybindingJsonObject(platforms.darwin) ? platforms.darwin : {},
    linux: isKeybindingJsonObject(platforms.linux) ? platforms.linux : {},
    win32: isKeybindingJsonObject(platforms.win32) ? platforms.win32 : {},
    [keybindingPlatform]: activePlatform
  }

  writeKeybindingJsonDocument(path, document)
  return readKeybindingFile(path, platform)
}
