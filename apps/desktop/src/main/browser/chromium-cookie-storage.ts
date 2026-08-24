import { execFileSync } from 'node:child_process'
import { pbkdf2Sync } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DetectedBrowser } from './browser-profile-discovery'
import { browserRootPath, findChromiumBrowserDefinition } from './browser-profile-discovery'
import { diag } from './cookie-import-diagnostics'

const PBKDF2_ITERATIONS = 1003
const PBKDF2_KEY_LENGTH = 16
const PBKDF2_SALT = 'saltysalt'

const CHROMIUM_EPOCH_OFFSET = 11644473600n

export function chromiumTimestampToUnix(chromiumTs: bigint | number | string): number {
  if (!chromiumTs || chromiumTs === 0n || chromiumTs === 0 || chromiumTs === '0') {
    return 0
  }
  try {
    const ts =
      typeof chromiumTs === 'bigint'
        ? chromiumTs
        : BigInt(typeof chromiumTs === 'number' ? Math.round(chromiumTs) : chromiumTs)
    if (ts === 0n) {
      return 0
    }
    return Math.max(Number(ts / 1000000n - CHROMIUM_EPOCH_OFFSET), 0)
  } catch {
    return 0
  }
}

// Why: each platform uses a different mechanism to protect the Chromium cookie encryption key.
// macOS: PBKDF2(keychain password, "saltysalt", 1003 iterations) → AES-128-CBC
// Linux: PBKDF2(keyring password or "peanuts", "saltysalt", 1 iteration) → AES-128-CBC
// Windows: DPAPI-encrypted master key from Local State → AES-256-GCM

export type EncryptionKeyResult = {
  key: Buffer
  mode: 'aes-128-cbc' | 'aes-256-gcm'
  // Why: Linux v10 cookies use a hardcoded "peanuts" password while v11 uses the
  // keyring password. We need both keys to decrypt the full cookie set.
  fallbackKey?: Buffer
}

export type ChromiumCookieColumnInfo = {
  name: string
  type?: string
  notnull?: number | bigint
  dflt_value?: unknown
}

function parseSqliteDefaultValue(raw: unknown, type: string): string | number | Buffer | null {
  if (raw === null || raw === undefined) {
    return null
  }
  if (typeof raw !== 'string') {
    return typeof raw === 'number' || typeof raw === 'bigint' ? Number(raw) : String(raw)
  }

  const trimmed = raw.trim()
  if (!trimmed || trimmed.toUpperCase() === 'NULL') {
    return null
  }
  if (/^X''$/i.test(trimmed) || type.includes('BLOB')) {
    return Buffer.alloc(0)
  }
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replaceAll("''", "'")
  }
  if (type.includes('INT')) {
    const numeric = Number(trimmed)
    return Number.isFinite(numeric) ? numeric : 0
  }
  return trimmed
}

function normalizeSqliteCookieValue(value: unknown): string | number | bigint | Buffer | null {
  if (value instanceof Uint8Array) {
    return Buffer.from(value)
  }
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
    return value
  }
  return String(value)
}

function isSqliteNotNull(column: ChromiumCookieColumnInfo): boolean {
  return Number(column.notnull ?? 0) !== 0
}

function fallbackChromiumCookieColumnValue(
  column: ChromiumCookieColumnInfo,
  sourceRow: Record<string, unknown>
): string | number | bigint | Buffer | null {
  const type = (column.type ?? '').toUpperCase()
  const defaultValue = parseSqliteDefaultValue(column.dflt_value, type)
  if (defaultValue !== null) {
    return defaultValue
  }
  if (!isSqliteNotNull(column)) {
    return null
  }

  switch (column.name) {
    case 'value':
    case 'encrypted_value':
      return Buffer.alloc(0)
    case 'top_frame_site_key':
      return ''
    case 'source_port':
      return -1
    case 'last_update_utc':
      return normalizeSqliteCookieValue(sourceRow.creation_utc) ?? 0
    default:
      if (type.includes('BLOB')) {
        return Buffer.alloc(0)
      }
      if (type.includes('INT')) {
        return 0
      }
      return ''
  }
}

export function buildChromiumCookieInsertParams(
  targetColumns: ChromiumCookieColumnInfo[],
  sourceRow: Record<string, unknown>,
  decryptedValue: Buffer
): (string | number | bigint | Buffer | null)[] {
  return targetColumns.map((column) => {
    if (column.name === 'encrypted_value') {
      return Buffer.alloc(0)
    }
    if (column.name === 'value') {
      return decryptedValue
    }

    const sourceHasColumn = Object.prototype.hasOwnProperty.call(sourceRow, column.name)
    const sourceValue = sourceHasColumn ? normalizeSqliteCookieValue(sourceRow[column.name]) : null
    if (sourceValue !== null) {
      return sourceValue
    }
    if (sourceHasColumn && !isSqliteNotNull(column)) {
      return null
    }

    // Why: Chromium cookie DB columns drift across Chrome/Electron versions.
    // Missing NOT NULL target columns must get safe Chromium defaults, not NULL.
    return fallbackChromiumCookieColumnValue(column, sourceRow)
  })
}

export function getEncryptionKey(
  keychainService: string,
  keychainAccount: string,
  browser?: DetectedBrowser
): EncryptionKeyResult | null {
  if (process.platform === 'darwin') {
    return getMacEncryptionKey(keychainService, keychainAccount)
  }
  if (process.platform === 'linux') {
    return getLinuxEncryptionKey(keychainService, keychainAccount)
  }
  if (process.platform === 'win32' && browser) {
    return getWindowsEncryptionKey(browser)
  }
  return null
}

function getMacEncryptionKey(
  keychainService: string,
  keychainAccount: string
): EncryptionKeyResult | null {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', keychainService, '-a', keychainAccount, '-w'],
      { encoding: 'utf-8', timeout: 30_000 }
    ).trim()
    return {
      key: pbkdf2Sync(raw, PBKDF2_SALT, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, 'sha1'),
      mode: 'aes-128-cbc'
    }
  } catch {
    return null
  }
}

function getLinuxEncryptionKey(
  keychainService: string,
  keychainAccount: string
): EncryptionKeyResult | null {
  // Why: Linux v10 cookies use the hardcoded password "peanuts" with 1 PBKDF2
  // iteration. v11 cookies use the actual keyring password. We derive both keys
  // so the decrypt function can try each based on the version prefix.
  const v10Key = pbkdf2Sync('peanuts', PBKDF2_SALT, 1, PBKDF2_KEY_LENGTH, 'sha1')

  let keyringPassword = ''
  try {
    // Why: GNOME keyring stores the Chrome Safe Storage password via secret-tool.
    keyringPassword = execFileSync(
      'secret-tool',
      ['lookup', 'service', keychainService, 'account', keychainAccount],
      { encoding: 'utf-8', timeout: 5_000 }
    ).trim()
  } catch {
    // Why: fall back to application-based lookup used by newer Chromium versions.
    try {
      const app = keychainAccount.toLowerCase().replaceAll(' ', '')
      keyringPassword = execFileSync('secret-tool', ['lookup', 'application', app], {
        encoding: 'utf-8',
        timeout: 5_000
      }).trim()
    } catch {
      diag('  Linux keyring unavailable — v11 cookies may fail to decrypt')
    }
  }

  const v11Key = pbkdf2Sync(keyringPassword, PBKDF2_SALT, 1, PBKDF2_KEY_LENGTH, 'sha1')
  return { key: v11Key, mode: 'aes-128-cbc', fallbackKey: v10Key }
}

function getWindowsEncryptionKey(browser: DetectedBrowser): EncryptionKeyResult | null {
  const browserDef = findChromiumBrowserDefinition(browser.family)
  if (!browserDef) {
    return null
  }
  const root = browserRootPath(browserDef)
  if (!root) {
    return null
  }

  const localStatePath = join(root, 'Local State')
  if (!existsSync(localStatePath)) {
    return null
  }

  try {
    const raw = readFileSync(localStatePath, 'utf-8')
    const localState = JSON.parse(raw)
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key
    if (typeof encryptedKeyB64 !== 'string') {
      return null
    }

    const encryptedKey = Buffer.from(encryptedKeyB64, 'base64')
    const dpapiPrefix = Buffer.from('DPAPI', 'utf-8')
    if (!encryptedKey.subarray(0, dpapiPrefix.length).equals(dpapiPrefix)) {
      return null
    }

    // Why: PowerShell DPAPI decrypt is the only way to access the master key
    // without native addons. The key is passed via stdin to prevent injection.
    const dpapiData = encryptedKey.subarray(dpapiPrefix.length).toString('base64')
    const script = [
      'try { Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop }',
      'catch { try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch {} };',
      '$in=[Convert]::FromBase64String([Console]::In.ReadLine());',
      '$out=[System.Security.Cryptography.ProtectedData]::Unprotect($in,$null,',
      '[System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
      '[Convert]::ToBase64String($out)'
    ].join('')

    const result = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf-8', timeout: 10_000, input: dpapiData }
    ).trim()

    return { key: Buffer.from(result, 'base64'), mode: 'aes-256-gcm' }
  } catch (err) {
    diag(`  Windows DPAPI key extraction failed: ${err}`)
    return null
  }
}
