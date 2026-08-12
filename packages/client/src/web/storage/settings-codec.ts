import type { GlobalSettings } from '~shared/types'

import { isJsonRecord, isJsonValue } from './local-json'

const INVALID_STORED_SETTING = Symbol('invalid-stored-setting')
const NULLABLE_STRING_SETTING_KEYS = new Set([
  'activeClaudeManagedAccountId',
  'activeCodexManagedAccountId',
  'activeRuntimeEnvironmentId',
  'androidSdkPath',
  'customSoundPath',
  'defaultTuiAgent',
  'localAccountWslDistro',
  'mobileEmulatorDefaultDeviceUdid',
  'terminalWindowsWslDistro'
])
const OPTIONAL_BOOLEAN_SETTING_KEYS = new Set([
  'experimentalSidekick',
  'terminalHiddenWorktreeRetentionBudget',
  'terminalSshViewParking'
])
const OPTIONAL_NUMBER_SETTING_KEYS = new Set([
  'terminalBackgroundOpacity',
  'terminalCursorOpacity',
  'terminalPaddingX',
  'terminalPaddingY'
])
const OPTIONAL_RECORD_SETTING_KEYS = new Set([
  'codexSessionSourceHome',
  'hostSettingOverrides',
  'telemetry',
  'terminalColorOverrides'
])
const OPTIONAL_STRING_SETTING_KEYS = new Set(['localAgentRuntime', 'terminalWordSeparator'])

export function decodeStoredWebSettings(
  defaults: GlobalSettings,
  stored: Record<string, unknown>
): GlobalSettings {
  const settings = structuredClone(defaults)
  for (const [key, value] of Object.entries(stored)) {
    if (!Object.hasOwn(defaults, key)) {
      const optional = decodeOptionalStoredSetting(key, value)
      if (optional !== INVALID_STORED_SETTING) {
        Reflect.set(settings, key, optional)
      }
      continue
    }
    const decoded = decodeStoredSettingValue(key, Reflect.get(defaults, key), value)
    if (decoded !== INVALID_STORED_SETTING) {
      Reflect.set(settings, key, decoded)
    }
  }
  return settings
}

function decodeOptionalStoredSetting(
  key: string,
  candidate: unknown
): unknown | typeof INVALID_STORED_SETTING {
  if (OPTIONAL_BOOLEAN_SETTING_KEYS.has(key)) {
    return typeof candidate === 'boolean' ? candidate : INVALID_STORED_SETTING
  }
  if (OPTIONAL_NUMBER_SETTING_KEYS.has(key)) {
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? candidate
      : INVALID_STORED_SETTING
  }
  if (OPTIONAL_STRING_SETTING_KEYS.has(key)) {
    return typeof candidate === 'string' ? candidate : INVALID_STORED_SETTING
  }
  if (key === 'localAgentWslDistro') {
    return candidate === null || typeof candidate === 'string' ? candidate : INVALID_STORED_SETTING
  }
  if (key === 'dismissedSkillFreshnessNudges') {
    return Array.isArray(candidate) && candidate.every((value) => typeof value === 'string')
      ? structuredClone(candidate)
      : INVALID_STORED_SETTING
  }
  if (OPTIONAL_RECORD_SETTING_KEYS.has(key)) {
    return isJsonRecord(candidate) && Object.values(candidate).every(isJsonValue)
      ? structuredClone(candidate)
      : INVALID_STORED_SETTING
  }
  return INVALID_STORED_SETTING
}

function decodeStoredSettingValue(
  key: string,
  template: unknown,
  candidate: unknown
): unknown | typeof INVALID_STORED_SETTING {
  if (template === null) {
    if (candidate === null) {
      return null
    }
    if (key === 'mobileAutoRestoreFitMs') {
      return typeof candidate === 'number' && Number.isFinite(candidate)
        ? candidate
        : INVALID_STORED_SETTING
    }
    return NULLABLE_STRING_SETTING_KEYS.has(key) && typeof candidate === 'string'
      ? candidate
      : INVALID_STORED_SETTING
  }
  if (typeof template === 'number') {
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? candidate
      : INVALID_STORED_SETTING
  }
  if (typeof template === 'string' || typeof template === 'boolean') {
    return typeof candidate === typeof template ? candidate : INVALID_STORED_SETTING
  }
  if (Array.isArray(template)) {
    return Array.isArray(candidate) && candidate.every(isJsonValue)
      ? structuredClone(candidate)
      : INVALID_STORED_SETTING
  }
  if (!isJsonRecord(template) || !isJsonRecord(candidate)) {
    return INVALID_STORED_SETTING
  }
  if (Object.keys(template).length === 0) {
    return Object.values(candidate).every(isJsonValue)
      ? structuredClone(candidate)
      : INVALID_STORED_SETTING
  }
  const decoded = structuredClone(template)
  for (const [nestedKey, nestedValue] of Object.entries(candidate)) {
    if (!Object.hasOwn(template, nestedKey)) {
      continue
    }
    const nested = decodeStoredSettingValue(
      nestedKey,
      Reflect.get(template, nestedKey),
      nestedValue
    )
    if (nested !== INVALID_STORED_SETTING) {
      Reflect.set(decoded, nestedKey, nested)
    }
  }
  return decoded
}
