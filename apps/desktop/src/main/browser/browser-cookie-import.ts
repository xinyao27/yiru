import { existsSync } from 'node:fs'

import type { BrowserCookieImportResult } from '~shared/types'

import type { DetectedBrowser } from './browser-profile-discovery'
import { importCookiesFromChromium } from './chromium-cookie-import'
import { diag } from './cookie-import-diagnostics'
import { importCookiesFromFirefox } from './firefox-cookie-import'
import { importCookiesFromSafari } from './safari-cookie-import'
import type { BrowserSession } from './session'

export async function importCookiesFromBrowser(
  browser: DetectedBrowser,
  targetPartition: string,
  targetSession: BrowserSession
): Promise<BrowserCookieImportResult> {
  diag(`importCookiesFromBrowser: browser=${browser.family} partition="${targetPartition}"`)
  if (!existsSync(browser.cookiesPath)) {
    diag(`  cookies DB not found: ${browser.cookiesPath}`)
    return { ok: false, reason: `${browser.label} cookies database not found.` }
  }

  if (browser.family === 'firefox') {
    return importCookiesFromFirefox(browser, targetPartition, targetSession.cookies)
  }
  if (browser.family === 'safari') {
    return importCookiesFromSafari(browser, targetPartition, targetSession.cookies)
  }
  return importCookiesFromChromium(browser, targetPartition, targetSession)
}
