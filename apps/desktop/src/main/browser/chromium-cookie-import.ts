import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { BrowserCookieImportResult, BrowserCookieImportSummary } from '~shared/types'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import type { DetectedBrowser } from './browser-profile-discovery'
import { getUserAgentForBrowser } from './browser-user-agent'
import { decryptCookieValueRaw } from './chromium-cookie-decryption'
import { resolveChromiumCookiesPath } from './chromium-cookie-path'
import {
  createChromiumCookieSnapshot,
  type ChromiumCookieSnapshot
} from './chromium-cookie-snapshot'
import {
  buildChromiumCookieInsertParams,
  chromiumTimestampToUnix,
  getEncryptionKey,
  type ChromiumCookieColumnInfo
} from './chromium-cookie-storage'
import { diag, reasonWithDiagLog, summarizeCookieImportError } from './cookie-import-diagnostics'
import { chromiumSameSite, deriveUrl } from './cookie-validation'
import type { BrowserSession } from './session'
import { browserSessionRegistry } from './session-registry'
import { setupClientHintsOverride } from './session-ua'

export async function importCookiesFromChromium(
  browser: DetectedBrowser,
  targetPartition: string,
  targetSession: BrowserSession
): Promise<BrowserCookieImportResult> {
  // Why: Electron's cookies.set() API rejects many valid cookie values (binary
  // bytes > 0x7F etc). Instead, decrypt from the source browser and write
  // plaintext directly to the SQLite `value` column. CookieMonster reads
  // `value` as a raw byte string when `encrypted_value` is empty, bypassing
  // all API-level validation. This works because Electron's CookieMonster in
  // dev mode does not use os_crypt encryption — it stores cookies as plaintext.
  // In packaged builds where os_crypt IS active, CookieMonster will re-encrypt
  // plaintext cookies on its next flush, so this approach is safe in both modes.

  // Why: CookieMonster holds the live DB's data in memory and overwrites it
  // on flush/shutdown. Writing directly to the live DB is futile. Instead,
  // copy the live DB to a staging location, populate it there, and let the
  // next cold start swap it in before CookieMonster initializes.
  await targetSession.cookies.flush()

  const partitionName = targetPartition.replace('persist:', '')
  const userDataPath = getRuntimeHostPathsProvider().userDataPath()
  const partitionDir = join(userDataPath, 'Partitions', partitionName)
  let liveCookiesPath = resolveChromiumCookiesPath(partitionDir)

  // Why: Electron only creates the partition's Cookies SQLite file after the
  // session has actually stored a cookie. For newly created profiles that have
  // never been used by a webview, the file won't exist yet. Setting and
  // removing a throwaway cookie forces Electron to initialize the database.
  if (!liveCookiesPath) {
    try {
      await targetSession.cookies.set({ url: 'https://localhost', name: '__init', value: '1' })
      await targetSession.cookies.remove('https://localhost', '__init')
      await targetSession.cookies.flush()
    } catch {
      // ignore — the set/remove may fail but flushStore should still create the file
    }
    liveCookiesPath = resolveChromiumCookiesPath(partitionDir)
  }

  if (!liveCookiesPath) {
    return { ok: false, reason: 'Target cookie database not found. Open a browser tab first.' }
  }

  const stagingDir = join(userDataPath, 'cookie-import-staging')
  const partitionSegment = partitionName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const stagingCookiesPath = join(
    stagingDir,
    `Cookies-${partitionSegment}-${Date.now()}-${randomUUID()}`
  )
  try {
    mkdirSync(stagingDir, { recursive: true })
    copyFileSync(liveCookiesPath, stagingCookiesPath)
  } catch {
    // Why: copyFile is not atomic and can leave a partial database after an
    // I/O failure, so failed imports must not retain sensitive cookie data.
    try {
      unlinkSync(stagingCookiesPath)
    } catch {
      /* best-effort */
    }
    return { ok: false, reason: 'Could not create staging cookie database.' }
  }

  let sourceSnapshot: ChromiumCookieSnapshot
  try {
    // Why: the browser can commit cookies only to WAL while it remains open;
    // snapshot retries prevent pairing the main DB with a racing WAL generation.
    sourceSnapshot = createChromiumCookieSnapshot(browser.cookiesPath)
  } catch (err) {
    try {
      unlinkSync(stagingCookiesPath)
    } catch {
      /* best-effort */
    }
    diag(`  Chromium snapshot failed: ${err}`)
    return {
      ok: false,
      reason: `Could not copy ${browser.label} cookies database. Try closing ${browser.label} first.`
    }
  }

  let sourceDb: InstanceType<typeof DatabaseSync> | null = null
  let stagingDb: InstanceType<typeof DatabaseSync> | null = null

  try {
    // Why: Chromium stores timestamps as microseconds since 1601, which can exceed
    // Number.MAX_SAFE_INTEGER (~9e15). readBigInts ensures no precision loss.
    sourceDb = new DatabaseSync(sourceSnapshot.databasePath, {
      readOnly: true,
      readBigInts: true
    })
    stagingDb = new DatabaseSync(stagingCookiesPath)

    const targetColumnInfo = stagingDb
      .prepare('PRAGMA table_info(cookies)')
      .all() as ChromiumCookieColumnInfo[]
    const targetCols: string[] = targetColumnInfo.map((r) => r.name)
    const colList = targetCols.join(', ')

    stagingDb.exec('DELETE FROM cookies')

    const sourceRows = sourceDb.prepare('SELECT * FROM cookies ORDER BY rowid').all() as Record<
      string,
      unknown
    >[]
    sourceDb.close()
    sourceDb = null

    diag(`  source has ${sourceRows.length} cookies`)

    if (sourceRows.length === 0) {
      stagingDb.close()
      stagingDb = null
      try {
        unlinkSync(stagingCookiesPath)
      } catch {
        /* best-effort */
      }
      return { ok: false, reason: `No cookies found in ${browser.label}.` }
    }

    const needsSourceKey = sourceRows.some((sourceRow) => {
      const encRaw = sourceRow.encrypted_value
      return encRaw instanceof Uint8Array && encRaw.length > 0
    })
    const sourceKey = needsSourceKey
      ? getEncryptionKey(browser.keychainService!, browser.keychainAccount!, browser)
      : null
    if (needsSourceKey && !sourceKey) {
      stagingDb.close()
      stagingDb = null
      // Why: key denial happens after staging, so failed retries must not leave
      // one full target database copy behind each time.
      try {
        unlinkSync(stagingCookiesPath)
      } catch {
        /* best-effort */
      }
      return {
        ok: false,
        reason: `Could not access ${browser.label} encryption key. The OS may have denied access.`
      }
    }

    // Why: Google's integrity cookies (SIDCC, __Secure-*PSIDCC, __Secure-STRP)
    // are cryptographically bound to the source browser's TLS fingerprint and
    // environment. Importing them into a different browser causes
    // accounts.google.com to reject the session with CookieMismatch. Skipping
    // them lets Google regenerate fresh integrity cookies on the first request.
    const INTEGRITY_COOKIE_NAMES = new Set([
      'SIDCC',
      '__Secure-1PSIDCC',
      '__Secure-3PSIDCC',
      '__Secure-STRP',
      'AEC'
    ])
    function isIntegrityCookie(name: string, domain: string): boolean {
      if (!INTEGRITY_COOKIE_NAMES.has(name)) {
        return false
      }
      const d = domain.startsWith('.') ? domain.slice(1) : domain
      return d === 'google.com' || d.endsWith('.google.com')
    }

    let imported = 0
    let skipped = 0
    let integritySkipped = 0
    let memoryLoaded = 0
    let memoryFailed = 0
    const domainSet = new Set<string>()

    type DecryptedCookie = {
      decryptedValue: Buffer
      value: string
      domain: string
      name: string
      path: string
      secure: boolean
      httpOnly: boolean
      sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
      expirationDate: number | undefined
    }

    const decryptedCookies: DecryptedCookie[] = []

    const placeholders = targetCols.map(() => '?').join(', ')
    const insertStmt = stagingDb.prepare(
      `INSERT OR REPLACE INTO cookies (${colList}) VALUES (${placeholders})`
    )

    stagingDb.exec('BEGIN TRANSACTION')

    for (const sourceRow of sourceRows) {
      const encRaw = sourceRow.encrypted_value
      // Why: node:sqlite returns BLOB columns as Uint8Array. Any other truthy type
      // means the schema is unexpected — treat it as missing rather than creating
      // an empty buffer that would silently produce a blank cookie value.
      const encBuf = encRaw instanceof Uint8Array ? Buffer.from(encRaw) : null
      const plainRaw = sourceRow.value

      let decryptedValue: Buffer
      if (encBuf && encBuf.length > 0) {
        const raw = sourceKey ? decryptCookieValueRaw(encBuf, sourceKey) : null
        if (!raw) {
          skipped++
          continue
        }
        decryptedValue = raw
      } else if (plainRaw instanceof Uint8Array) {
        decryptedValue = Buffer.from(plainRaw)
      } else if (typeof plainRaw === 'string') {
        decryptedValue = Buffer.from(plainRaw, 'latin1')
      } else {
        decryptedValue = Buffer.alloc(0)
      }

      const domain = sourceRow.host_key as string
      const name = sourceRow.name as string

      if (isIntegrityCookie(name, domain)) {
        integritySkipped++
        continue
      }

      const cleanDomain = domain.startsWith('.') ? domain.slice(1) : domain
      domainSet.add(cleanDomain)

      const path = sourceRow.path as string
      const secure = sourceRow.is_secure === 1n
      const httpOnly = sourceRow.is_httponly === 1n
      const sameSite = chromiumSameSite(Number(sourceRow.samesite ?? 0))
      const expiresUtc = chromiumTimestampToUnix(sourceRow.expires_utc as bigint)
      // Why: cookie values are raw byte strings, not UTF-8 text. Using latin1
      // (ISO-8859-1) preserves all byte values 0x00–0xFF without replacement
      // characters that UTF-8 decoding would insert for invalid sequences.
      const value = decryptedValue.toString('latin1')

      decryptedCookies.push({
        decryptedValue,
        value,
        domain,
        name,
        path,
        secure,
        httpOnly,
        sameSite,
        expirationDate: expiresUtc > 0 ? expiresUtc : undefined
      })

      const params = buildChromiumCookieInsertParams(targetColumnInfo, sourceRow, decryptedValue)
      insertStmt.run(...params)
      imported++
    }
    diag(`  skipped ${integritySkipped} Google integrity cookies (SIDCC/STRP/AEC)`)

    stagingDb.exec('COMMIT')
    stagingDb.close()
    stagingDb = null

    diag(`  SQLite staging complete: ${imported} cookies, ${domainSet.size} domains`)

    // Why: clearing the session's in-memory cookie store before loading imported
    // cookies prevents stale cookies from a previous Yiru browsing session from
    // mixing with the imported set. Mixed state (some old, some imported) causes
    // sites like Google to detect inconsistent session cookies and reject them.
    await targetSession.clearCookies()
    diag(
      `  cleared existing session cookies before loading ${decryptedCookies.length} imported cookies`
    )

    // Why: loading cookies into memory via cookies.set() makes them available
    // immediately without requiring a restart. The staging DB is kept as a
    // fallback for any cookies that fail the cookies.set() validation.
    for (const cookie of decryptedCookies) {
      const url = deriveUrl(cookie.domain, cookie.secure)
      if (!url) {
        memoryFailed++
        continue
      }
      try {
        // Why: __Host- prefixed cookies must not have a domain attribute and
        // must have path=/. Chromium rejects them otherwise.
        const isHostPrefixed = cookie.name.startsWith('__Host-')
        await targetSession.cookies.set({
          url,
          name: cookie.name,
          value: cookie.value,
          ...(isHostPrefixed ? {} : { domain: cookie.domain }),
          path: isHostPrefixed ? '/' : cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          expirationDate: cookie.expirationDate
        })
        memoryLoaded++
      } catch {
        memoryFailed++
      }
    }

    diag(`  memory load: ${memoryLoaded} OK, ${memoryFailed} failed`)

    if (memoryFailed > 0) {
      // Why: some cookies couldn't be loaded via cookies.set() (non-ASCII values
      // or other validation failures). Keep the staging DB so the next cold start
      // picks them up from SQLite where CookieMonster reads them without validation.
      browserSessionRegistry.setPendingCookieImport(targetPartition, stagingCookiesPath)
      diag(`  staged at ${stagingCookiesPath} for ${memoryFailed} cookies that need restart`)
    } else {
      try {
        unlinkSync(stagingCookiesPath)
      } catch {
        /* best-effort */
      }
      diag(`  all cookies loaded in-memory — no restart needed`)
    }

    const ua = getUserAgentForBrowser(browser.family)
    if (ua) {
      targetSession.setUserAgent(ua)
      setupClientHintsOverride(targetSession, ua)
      browserSessionRegistry.persistUserAgent(targetPartition, ua)
      diag(`  set UA for partition: ${ua.substring(0, 80)}...`)
    }

    const summary: BrowserCookieImportSummary = {
      totalCookies: sourceRows.length,
      importedCookies: imported,
      skippedCookies: skipped,
      domains: [...domainSet].sort()
    }

    return { ok: true, profileId: '', summary }
  } catch (err) {
    try {
      sourceDb?.close()
    } catch {
      /* may already be closed */
    }
    try {
      stagingDb?.close()
    } catch {
      /* may already be closed */
    }
    // Why: if the import fails after the staging DB was created, clean it up
    // to avoid a stale staged import being applied on the next cold start.
    try {
      unlinkSync(stagingCookiesPath)
    } catch {
      /* may not exist yet */
    }
    diag(`  SQLite import failed: ${err}`)
    return {
      ok: false,
      reason: reasonWithDiagLog(
        `Could not import cookies from ${browser.label}: ${summarizeCookieImportError(err)}.`
      )
    }
  } finally {
    try {
      sourceSnapshot.cleanup()
    } catch (err) {
      diag(`  Chromium snapshot cleanup failed: ${err}`)
    }
  }
}
