import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import type { BrowserCookieImportResult, BrowserCookieImportSummary } from '~shared/types'

import type { BrowserBackend } from './backend'
import { createChromiumCookieSnapshot } from './chromium-cookie-snapshot'
import {
  chromiumSameSite,
  chromiumTimestampToUnix,
  decryptCookieValueRaw,
  deriveUrl,
  getEncryptionKey,
  importCookiesFromFirefox,
  importCookiesFromSafari,
  type DetectedBrowser
} from './cookie-import'
import type { BrowserCookie, BrowserCookieStore } from './session'

type HeadlessCookieBackend = BrowserBackend & {
  clearProfileCookies(profileId: string | null): Promise<void>
  setProfileCookie(profileId: string, cookie: BrowserCookie): Promise<void>
}

const INTEGRITY_COOKIE_NAMES = new Set([
  'SIDCC',
  '__Secure-1PSIDCC',
  '__Secure-3PSIDCC',
  '__Secure-STRP',
  'AEC'
])

function isHeadlessCookieBackend(backend: BrowserBackend): backend is HeadlessCookieBackend {
  return Boolean(backend.clearProfileCookies && backend.setProfileCookie)
}

function createCookieStore(backend: HeadlessCookieBackend, profileId: string): BrowserCookieStore {
  return {
    flush: async () => {},
    remove: async () => {},
    set: (cookie) => backend.setProfileCookie(profileId, cookie)
  }
}

function isEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === 1n
}

function isIntegrityCookie(name: string, domain: string): boolean {
  if (!INTEGRITY_COOKIE_NAMES.has(name)) {
    return false
  }
  const normalizedDomain = domain.startsWith('.') ? domain.slice(1) : domain
  return normalizedDomain === 'google.com' || normalizedDomain.endsWith('.google.com')
}

function readCookieValue(
  row: Record<string, unknown>,
  sourceKey: ReturnType<typeof getEncryptionKey>
): string | null {
  const encrypted = row.encrypted_value
  if (encrypted instanceof Uint8Array && encrypted.length > 0) {
    const decrypted = sourceKey ? decryptCookieValueRaw(Buffer.from(encrypted), sourceKey) : null
    return decrypted?.toString('latin1') ?? null
  }
  if (row.value instanceof Uint8Array) {
    return Buffer.from(row.value).toString('latin1')
  }
  return typeof row.value === 'string' ? row.value : ''
}

async function importChromiumCookies(
  browser: DetectedBrowser,
  profileId: string,
  targetCookies: BrowserCookieStore,
  clearTargetCookies: () => Promise<void>
): Promise<BrowserCookieImportResult> {
  if (!existsSync(browser.cookiesPath)) {
    return { ok: false, reason: `${browser.label} cookies database not found.` }
  }
  const snapshot = createChromiumCookieSnapshot(browser.cookiesPath)
  let sourceDb: InstanceType<typeof DatabaseSync> | null = null
  try {
    sourceDb = new DatabaseSync(snapshot.databasePath, { readOnly: true, readBigInts: true })
    const rows = sourceDb.prepare('SELECT * FROM cookies ORDER BY rowid').all() as Record<
      string,
      unknown
    >[]
    sourceDb.close()
    sourceDb = null
    if (rows.length === 0) {
      return { ok: false, reason: `No cookies found in ${browser.label}.` }
    }
    const needsSourceKey = rows.some(
      (row) => row.encrypted_value instanceof Uint8Array && row.encrypted_value.length > 0
    )
    const sourceKey =
      needsSourceKey && browser.keychainService && browser.keychainAccount
        ? getEncryptionKey(browser.keychainService, browser.keychainAccount, browser)
        : null
    if (needsSourceKey && !sourceKey) {
      return {
        ok: false,
        reason: `Could not access ${browser.label} encryption key. The OS may have denied access.`
      }
    }

    let importedCookies = 0
    let skippedCookies = 0
    const domains = new Set<string>()
    const cookies: BrowserCookie[] = []
    for (const row of rows) {
      const name = typeof row.name === 'string' ? row.name : ''
      const domain = typeof row.host_key === 'string' ? row.host_key : ''
      const value = readCookieValue(row, sourceKey)
      if (!name || !domain || value === null || isIntegrityCookie(name, domain)) {
        skippedCookies++
        continue
      }
      const secure = isEnabled(row.is_secure)
      const url = deriveUrl(domain, secure)
      if (!url) {
        skippedCookies++
        continue
      }
      const expires =
        typeof row.expires_utc === 'bigint' ||
        typeof row.expires_utc === 'number' ||
        typeof row.expires_utc === 'string'
          ? chromiumTimestampToUnix(row.expires_utc)
          : 0
      cookies.push({
        url,
        name,
        value,
        ...(name.startsWith('__Host-') ? {} : { domain }),
        path: name.startsWith('__Host-')
          ? '/'
          : typeof row.path === 'string' && row.path
            ? row.path
            : '/',
        secure,
        httpOnly: isEnabled(row.is_httponly),
        sameSite: chromiumSameSite(Number(row.samesite ?? 0)),
        ...(expires > 0 ? { expirationDate: expires } : {})
      })
    }
    await clearTargetCookies()
    for (const cookie of cookies) {
      try {
        await targetCookies.set(cookie)
        importedCookies++
        const domain = cookie.domain ?? new URL(cookie.url).hostname
        domains.add(domain.startsWith('.') ? domain.slice(1) : domain)
      } catch {
        skippedCookies++
      }
    }
    const summary: BrowserCookieImportSummary = {
      totalCookies: rows.length,
      importedCookies,
      skippedCookies,
      domains: [...domains].sort()
    }
    return { ok: true, profileId, summary }
  } catch {
    return { ok: false, reason: `Could not import cookies from ${browser.label}.` }
  } finally {
    try {
      sourceDb?.close()
    } catch {
      // Why: the import result is already settled; a redundant close cannot change it.
    }
    try {
      snapshot.cleanup()
    } catch {
      // Why: cleanup failure must not replace the contract-level import result.
    }
  }
}

export async function importCookiesIntoHeadlessProfile(
  browser: DetectedBrowser,
  profileId: string,
  backend: BrowserBackend
): Promise<BrowserCookieImportResult> {
  if (!isHeadlessCookieBackend(backend)) {
    return { ok: false, reason: 'This browser backend cannot import cookies.' }
  }
  try {
    const targetCookies = createCookieStore(backend, profileId)
    if (browser.family === 'firefox') {
      return await importCookiesFromFirefox(browser, profileId, targetCookies)
    }
    if (browser.family === 'safari') {
      return await importCookiesFromSafari(browser, profileId, targetCookies)
    }
    return await importChromiumCookies(browser, profileId, targetCookies, () =>
      backend.clearProfileCookies(profileId)
    )
  } catch {
    return { ok: false, reason: `Could not import cookies from ${browser.label}.` }
  }
}
