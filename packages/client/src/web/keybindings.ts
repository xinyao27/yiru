import { translate } from '~renderer/i18n/i18n'
import {
  findKeybindingConflicts,
  formatKeybindingList,
  getKeybindingPlatform,
  isKeybindingActionId,
  normalizeKeybindingArrayForAction,
  type KeybindingActionId,
  type KeybindingFileDiagnostic,
  type KeybindingFileSnapshot,
  type KeybindingOverrides,
  type KeybindingPlatform
} from '~shared/keybindings'

const KEYBINDINGS_STORAGE_KEY = 'yiru.web.keybindings.v1'
const WEB_KEYBINDING_PLATFORMS: readonly KeybindingPlatform[] = ['darwin', 'linux', 'win32']
const listeners = new Set<(snapshot: KeybindingFileSnapshot) => void>()

type WebKeybindingDocument = {
  version: 1
  keybindings: KeybindingOverrides
  platforms: Partial<Record<KeybindingPlatform, KeybindingOverrides>>
}

export function createWebKeybindingsApi() {
  return {
    get: () => Promise.resolve(getSnapshot()),
    ensureFile: () => Promise.resolve(getSnapshot()),
    setAction: async (args: {
      actionId: KeybindingActionId
      bindings: string[] | null
    }): Promise<KeybindingFileSnapshot> => writeAction(args.actionId, args.bindings),
    reload: () => {
      const snapshot = getSnapshot()
      notifyListeners(snapshot)
      return Promise.resolve(snapshot)
    },
    openFile: () => Promise.resolve(getSnapshot()),
    revealFile: () => Promise.resolve(getSnapshot()),
    onChanged: (callback: (snapshot: KeybindingFileSnapshot) => void) => {
      listeners.add(callback)
      const onStorage = (event: StorageEvent): void => {
        if (event.key === KEYBINDINGS_STORAGE_KEY) {
          callback(getSnapshot())
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(callback)
        window.removeEventListener('storage', onStorage)
      }
    }
  }
}

function getSnapshot(): KeybindingFileSnapshot {
  const platform = getWebKeybindingPlatform()
  const diagnostics: KeybindingFileDiagnostic[] = []
  const document = readDocument()
  const commonOverrides = normalizeOverrides(document.keybindings, 'keybindings', diagnostics)
  const platformOverrides = normalizePlatformOverrides(document.platforms, diagnostics)
  const overrides = removeConflicts(
    platform,
    { ...commonOverrides, ...platformOverrides[platform] },
    diagnostics
  )
  return {
    path: 'Browser local storage',
    platform,
    exists: window.localStorage.getItem(KEYBINDINGS_STORAGE_KEY) !== null,
    overrides,
    commonOverrides,
    platformOverrides,
    diagnostics
  }
}

function writeAction(
  actionId: KeybindingActionId,
  bindings: string[] | null
): KeybindingFileSnapshot {
  const normalized =
    bindings === null ? null : normalizeKeybindingArrayForAction(actionId, bindings)
  if (normalized !== null && !Array.isArray(normalized)) {
    throw new Error(normalized.ok ? 'Unable to parse shortcut.' : normalized.error)
  }
  const platform = getWebKeybindingPlatform()
  const current = getSnapshot()
  const candidate = { ...current.overrides }
  if (normalized === null) {
    delete candidate[actionId]
  } else {
    candidate[actionId] = normalized
  }
  const conflict = findKeybindingConflicts(platform, candidate).find((entry) =>
    entry.actionIds.includes(actionId)
  )
  if (conflict) {
    throw new Error(
      `${formatKeybindingList([conflict.binding], platform)} conflicts with another shortcut.`
    )
  }
  const activePlatform = { ...current.platformOverrides[platform] }
  if (normalized === null) {
    delete activePlatform[actionId]
  } else {
    activePlatform[actionId] = normalized
  }
  writeDocument({
    version: 1,
    keybindings: current.commonOverrides,
    platforms: {
      ...current.platformOverrides,
      darwin: current.platformOverrides.darwin ?? {},
      linux: current.platformOverrides.linux ?? {},
      win32: current.platformOverrides.win32 ?? {},
      [platform]: activePlatform
    }
  })
  const snapshot = getSnapshot()
  notifyListeners(snapshot)
  return snapshot
}

function normalizeOverrides(
  value: unknown,
  section: string,
  diagnostics: KeybindingFileDiagnostic[]
): KeybindingOverrides {
  if (value === undefined) {
    return {}
  }
  if (!isJsonObject(value)) {
    diagnostics.push({
      severity: 'error',
      section,
      message: translate('auto.web.web.preload.api.d2e43e426a', '{{value0}} must be an object.', {
        value0: section
      })
    })
    return {}
  }
  const overrides: KeybindingOverrides = {}
  for (const [actionId, rawBindings] of Object.entries(value)) {
    if (!isKeybindingActionId(actionId)) {
      diagnostics.push({
        severity: 'warning',
        section,
        actionId,
        message: translate(
          'auto.web.web.preload.api.36761d9604',
          'Unknown keybinding action "{{value0}}" was ignored.',
          { value0: actionId }
        )
      })
      continue
    }
    if (!Array.isArray(rawBindings) || !rawBindings.every((value) => typeof value === 'string')) {
      diagnostics.push({
        severity: 'error',
        section,
        actionId,
        message: translate(
          'auto.web.web.preload.api.10898045f3',
          'Shortcut for "{{value0}}" was ignored: Use a string array.',
          { value0: actionId }
        )
      })
      continue
    }
    const normalized = normalizeKeybindingArrayForAction(actionId, rawBindings)
    if (!Array.isArray(normalized)) {
      diagnostics.push({
        severity: 'error',
        section,
        actionId,
        message: translate(
          'auto.web.web.preload.api.76122208ca',
          'Shortcut for "{{value0}}" was ignored: {{value1}}',
          {
            value0: actionId,
            value1: normalized.ok ? 'Unable to parse shortcut.' : normalized.error
          }
        )
      })
      continue
    }
    overrides[actionId] = normalized
  }
  return overrides
}

function normalizePlatformOverrides(
  value: unknown,
  diagnostics: KeybindingFileDiagnostic[]
): Partial<Record<KeybindingPlatform, KeybindingOverrides>> {
  if (value === undefined) {
    return {}
  }
  if (!isJsonObject(value)) {
    diagnostics.push({
      severity: 'error',
      section: 'platforms',
      message: translate(
        'auto.web.web.preload.api.0a69fcd8bc',
        'platforms must be an object with darwin, linux, or win32 sections.'
      )
    })
    return {}
  }
  const result: Partial<Record<KeybindingPlatform, KeybindingOverrides>> = {}
  for (const [platform, overrides] of Object.entries(value)) {
    if (!WEB_KEYBINDING_PLATFORMS.includes(platform as KeybindingPlatform)) {
      diagnostics.push({
        severity: 'warning',
        section: `platforms.${platform}`,
        message: translate(
          'auto.web.web.preload.api.32f15bdb0f',
          'Unknown platform "{{value0}}" was ignored.',
          { value0: platform }
        )
      })
      continue
    }
    result[platform as KeybindingPlatform] = normalizeOverrides(
      overrides,
      `platforms.${platform}`,
      diagnostics
    )
  }
  return result
}

function removeConflicts(
  platform: KeybindingPlatform,
  overrides: KeybindingOverrides,
  diagnostics: KeybindingFileDiagnostic[]
): KeybindingOverrides {
  const next = { ...overrides }
  const conflicting = new Set<KeybindingActionId>()
  for (const conflict of findKeybindingConflicts(platform, next)) {
    for (const actionId of conflict.actionIds) {
      if (Object.prototype.hasOwnProperty.call(next, actionId)) {
        conflicting.add(actionId)
      }
    }
  }
  for (const actionId of conflicting) {
    delete next[actionId]
  }
  if (conflicting.size > 0) {
    diagnostics.push({
      severity: 'error',
      message: translate(
        'auto.web.web.preload.api.52bee9d8a0',
        'Conflicting custom shortcuts were ignored: {{value0}}.',
        { value0: Array.from(conflicting).join(', ') }
      )
    })
  }
  return next
}

function readDocument(): WebKeybindingDocument {
  const empty: WebKeybindingDocument = { version: 1, keybindings: {}, platforms: {} }
  const raw = window.localStorage.getItem(KEYBINDINGS_STORAGE_KEY)
  if (!raw) {
    return empty
  }
  try {
    const document = JSON.parse(raw) as WebKeybindingDocument
    return {
      version: 1,
      keybindings: isJsonObject(document.keybindings) ? document.keybindings : {},
      platforms: isJsonObject(document.platforms) ? document.platforms : {}
    }
  } catch {
    return empty
  }
}

function writeDocument(document: WebKeybindingDocument): void {
  window.localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(document))
}

function notifyListeners(snapshot: KeybindingFileSnapshot): void {
  for (const listener of listeners) {
    listener(snapshot)
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getWebKeybindingPlatform(): KeybindingPlatform {
  const platform: NodeJS.Platform = navigator.userAgent.includes('Mac')
    ? 'darwin'
    : navigator.userAgent.includes('Windows')
      ? 'win32'
      : 'linux'
  return getKeybindingPlatform(platform)
}
