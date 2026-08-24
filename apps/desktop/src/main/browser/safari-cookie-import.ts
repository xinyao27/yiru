import { readFileSync } from 'node:fs'

import type { BrowserCookieImportResult } from '~shared/types'

import type { DetectedBrowser } from './browser-profile-discovery'
import { diag } from './cookie-import-diagnostics'
import { importValidatedCookies } from './cookie-validation'
import { decodeSafariBinaryCookies } from './safari-cookie-codec'
import type { BrowserCookieStore } from './session'

export async function importCookiesFromSafari(
  browser: DetectedBrowser,
  targetPartition: string,
  targetCookies: BrowserCookieStore
): Promise<BrowserCookieImportResult> {
  diag(`importCookiesFromSafari: partition="${targetPartition}"`)

  let data: Buffer
  try {
    data = readFileSync(browser.cookiesPath)
  } catch (err) {
    diag(`  Safari read failed: ${err}`)
    // Why: Safari's Cookies.binarycookies lives inside a macOS sandbox container.
    // Reading it requires Full Disk Access in System Settings → Privacy & Security.
    const isPermError =
      err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EPERM'
    if (isPermError) {
      return {
        ok: false,
        reason:
          'macOS denied access to Safari cookies. Grant Full Disk Access to Yiru in System Settings → Privacy & Security → Full Disk Access.'
      }
    }
    return { ok: false, reason: 'Could not read Safari cookies.' }
  }

  try {
    const cookies = decodeSafariBinaryCookies(data)
    diag(`  Safari source has ${cookies.length} cookies`)

    if (cookies.length === 0) {
      return { ok: false, reason: 'No cookies found in Safari.' }
    }

    const now = Math.floor(Date.now() / 1000)
    const valid = cookies.filter((c) => !c.expirationDate || c.expirationDate > now)

    if (valid.length === 0) {
      return { ok: false, reason: 'All Safari cookies are expired.' }
    }

    return importValidatedCookies(valid, cookies.length, targetPartition, targetCookies)
  } catch (err) {
    diag(`  Safari import failed: ${err}`)
    return { ok: false, reason: 'Could not import cookies from Safari.' }
  }
}
