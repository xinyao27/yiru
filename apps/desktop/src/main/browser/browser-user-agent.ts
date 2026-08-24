import { execFileSync } from 'node:child_process'

import type { BrowserSessionProfileSource } from '~shared/types'

// Why: Google and other services bind auth cookies to the User-Agent that
// created them. We read the source browser's real version from its plist
// and construct a matching UA string so imported sessions aren't invalidated.
export function getUserAgentForBrowser(
  family: BrowserSessionProfileSource['browserFamily']
): string | null {
  // Why: UA spoofing uses macOS-specific plist reading. On other platforms,
  // skip UA override — the default Electron UA is acceptable.
  if (process.platform !== 'darwin') {
    return null
  }

  const platform = 'Macintosh; Intel Mac OS X 10_15_7'
  const chromeBase = 'AppleWebKit/537.36 (KHTML, like Gecko)'

  function readBrowserVersion(
    appPath: string,
    plistKey = 'CFBundleShortVersionString'
  ): string | null {
    try {
      return (
        execFileSync('defaults', ['read', `${appPath}/Contents/Info`, plistKey], {
          encoding: 'utf-8',
          timeout: 5_000
        }).trim() || null
      )
    } catch {
      return null
    }
  }

  switch (family) {
    case 'chrome': {
      const v = readBrowserVersion('/Applications/Google Chrome.app')
      return v ? `Mozilla/5.0 (${platform}) ${chromeBase} Chrome/${v} Safari/537.36` : null
    }
    case 'edge': {
      const v = readBrowserVersion('/Applications/Microsoft Edge.app')
      return v ? `Mozilla/5.0 (${platform}) ${chromeBase} Chrome/${v} Safari/537.36 Edg/${v}` : null
    }
    case 'arc': {
      const v = readBrowserVersion('/Applications/Arc.app')
      return v ? `Mozilla/5.0 (${platform}) ${chromeBase} Chrome/${v} Safari/537.36` : null
    }
    case 'chromium': {
      const v = readBrowserVersion('/Applications/Brave Browser.app')
      return v ? `Mozilla/5.0 (${platform}) ${chromeBase} Chrome/${v} Safari/537.36` : null
    }
    case 'comet': {
      // Why: Comet is Chromium-based and ships a Chrome-shaped version in its plist.
      // Use the same UA shape as Chrome itself so Google-bound auth cookies survive import.
      const v = readBrowserVersion('/Applications/Comet.app')
      return v ? `Mozilla/5.0 (${platform}) ${chromeBase} Chrome/${v} Safari/537.36` : null
    }
    case 'helium': {
      // Why: Helium is Chromium-based and ships a Chrome-shaped version in its plist.
      // Use the same UA shape as Chrome itself so Google-bound auth cookies survive import.
      const v = readBrowserVersion('/Applications/Helium.app')
      return v ? `Mozilla/5.0 (${platform}) ${chromeBase} Chrome/${v} Safari/537.36` : null
    }
    case 'firefox':
    case 'safari':
    case 'manual':
      return null
  }
}
