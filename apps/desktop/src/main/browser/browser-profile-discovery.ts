import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { BrowserSessionProfileSource } from '~shared/types'

import { resolveChromiumCookiesPath } from './chromium-cookie-path'
import { detectFirefox, firefoxProfilesRoot } from './firefox-profile-discovery'

export type BrowserProfile = {
  name: string
  directory: string
}

export type DetectedBrowser = {
  family: BrowserSessionProfileSource['browserFamily']
  label: string
  cookiesPath: string
  keychainService?: string
  keychainAccount?: string
  profiles: BrowserProfile[]
  selectedProfile: string
}

export type ChromiumBrowserDefinition = {
  family: BrowserSessionProfileSource['browserFamily']
  label: string
  keychainService: string
  keychainAccount: string
  // Why: each platform stores browser data in a different location. The per-platform
  // root paths are resolved at detection time via browserRootPath().
  macRoot?: string
  winRoot?: string
  linuxRoot?: string
}

const CHROMIUM_BROWSERS: ChromiumBrowserDefinition[] = [
  {
    family: 'chrome',
    label: 'Google Chrome',
    keychainService: 'Chrome Safe Storage',
    keychainAccount: 'Chrome',
    macRoot: 'Google/Chrome',
    winRoot: 'Google/Chrome/User Data',
    linuxRoot: 'google-chrome'
  },
  {
    family: 'edge',
    label: 'Microsoft Edge',
    keychainService: 'Microsoft Edge Safe Storage',
    keychainAccount: 'Microsoft Edge',
    macRoot: 'Microsoft Edge',
    winRoot: 'Microsoft/Edge/User Data',
    linuxRoot: 'microsoft-edge'
  },
  {
    family: 'arc',
    label: 'Arc',
    keychainService: 'Arc Safe Storage',
    keychainAccount: 'Arc',
    macRoot: 'Arc/User Data'
  },
  {
    family: 'chromium',
    label: 'Brave',
    keychainService: 'Brave Safe Storage',
    keychainAccount: 'Brave',
    macRoot: 'BraveSoftware/Brave-Browser',
    winRoot: 'BraveSoftware/Brave-Browser/User Data',
    linuxRoot: 'BraveSoftware/Brave-Browser'
  },
  {
    family: 'comet',
    label: 'Comet',
    keychainService: 'Comet Safe Storage',
    keychainAccount: 'Comet',
    macRoot: 'Comet',
    winRoot: 'Comet/User Data'
    // linuxRoot intentionally omitted — Comet does not ship a Linux build as of 2026-05-15
  },
  {
    family: 'helium',
    // Why: Helium deviates from the '<Browser> Safe Storage'/'<Browser>' convention —
    // its Keychain entry is literally service 'Helium Storage Key', account 'Helium'.
    label: 'Helium',
    keychainService: 'Helium Storage Key',
    keychainAccount: 'Helium',
    macRoot: 'net.imput.helium'
    // winRoot/linuxRoot intentionally omitted — only the macOS install is verified
  }
]

export function findChromiumBrowserDefinition(
  family: BrowserSessionProfileSource['browserFamily']
): ChromiumBrowserDefinition | null {
  return CHROMIUM_BROWSERS.find((browser) => browser.family === family) ?? null
}

export function browserRootPath(def: ChromiumBrowserDefinition): string | null {
  if (process.platform === 'darwin') {
    if (!def.macRoot) {
      return null
    }
    const home = process.env.HOME ?? ''
    return join(home, 'Library', 'Application Support', def.macRoot)
  }
  if (process.platform === 'win32') {
    if (!def.winRoot) {
      return null
    }
    const localAppData = process.env.LOCALAPPDATA ?? ''
    if (!localAppData) {
      return null
    }
    return join(localAppData, def.winRoot)
  }
  // Linux
  if (!def.linuxRoot) {
    return null
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? '', '.config')
  return join(configHome, def.linuxRoot)
}

function isSafeBrowserProfileDirectory(directory: string): boolean {
  return (
    directory.length > 0 &&
    directory !== '.' &&
    !directory.includes('\0') &&
    !directory.includes('/') &&
    !directory.includes('\\') &&
    !directory.includes('..')
  )
}

// Why: Chrome's Local State JSON contains profile.info_cache which maps profile
// directory names (e.g. "Default", "Profile 1") to metadata including the
// user-visible display name. This lets us show human-readable names in the picker.
function discoverProfiles(browserRoot: string): BrowserProfile[] {
  try {
    const localStatePath = join(browserRoot, 'Local State')
    if (!existsSync(localStatePath)) {
      return [{ name: 'Default', directory: 'Default' }]
    }
    const raw = readFileSync(localStatePath, 'utf-8')
    const localState = JSON.parse(raw)
    const infoCache = localState?.profile?.info_cache
    if (!infoCache || typeof infoCache !== 'object') {
      return [{ name: 'Default', directory: 'Default' }]
    }
    const profiles: BrowserProfile[] = []
    for (const [dir, info] of Object.entries(infoCache)) {
      // Why: Local State is external metadata, but profile dirs become path segments.
      if (!isSafeBrowserProfileDirectory(dir)) {
        continue
      }
      const profileName = (info as { name?: string })?.name ?? dir
      profiles.push({ name: profileName, directory: dir })
    }
    return profiles.length > 0 ? profiles : [{ name: 'Default', directory: 'Default' }]
  } catch {
    return [{ name: 'Default', directory: 'Default' }]
  }
}

// ---------------------------------------------------------------------------
// Safari detection
// ---------------------------------------------------------------------------

function detectSafari(): DetectedBrowser | null {
  if (process.platform !== 'darwin') {
    return null
  }
  const home = process.env.HOME ?? ''
  const candidates = [
    join(home, 'Library', 'Cookies', 'Cookies.binarycookies'),
    join(
      home,
      'Library',
      'Containers',
      'com.apple.Safari',
      'Data',
      'Library',
      'Cookies',
      'Cookies.binarycookies'
    )
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        family: 'safari',
        label: 'Safari',
        cookiesPath: candidate,
        profiles: [{ name: 'Default', directory: 'Default' }],
        selectedProfile: 'Default'
      }
    }
  }
  return null
}

export function detectInstalledBrowsers(): DetectedBrowser[] {
  const detected: DetectedBrowser[] = []
  for (const browser of CHROMIUM_BROWSERS) {
    const root = browserRootPath(browser)
    if (!root) {
      continue
    }
    const profiles = discoverProfiles(root)
    // Why: a browser is "detected" if at least one profile has a cookies DB.
    // Use the first profile with a valid cookies path as the default selection.
    for (const profile of profiles) {
      const profileDir = join(root, profile.directory)
      const cookiesPath = resolveChromiumCookiesPath(profileDir)
      if (cookiesPath) {
        detected.push({
          family: browser.family,
          label: browser.label,
          keychainService: browser.keychainService,
          keychainAccount: browser.keychainAccount,
          cookiesPath,
          profiles,
          selectedProfile: profile.directory
        })
        break
      }
    }
  }

  const firefox = detectFirefox()
  if (firefox) {
    detected.push(firefox)
  }

  const safari = detectSafari()
  if (safari) {
    detected.push(safari)
  }

  return detected
}

// Why: when the user selects a different profile from the picker, we need to
// resolve the cookies path for that profile. Returns a new DetectedBrowser
// with the updated cookiesPath and selectedProfile, or null if the profile
// has no cookies DB.
export function selectBrowserProfile(
  browser: DetectedBrowser,
  profileDirectory: string
): DetectedBrowser | null {
  if (!isSafeBrowserProfileDirectory(profileDirectory)) {
    return null
  }
  if (browser.family === 'firefox') {
    const profilesRoot = firefoxProfilesRoot()
    if (!profilesRoot) {
      return null
    }
    const cookiesPath = join(profilesRoot, profileDirectory, 'cookies.sqlite')
    if (!existsSync(cookiesPath)) {
      return null
    }
    return { ...browser, cookiesPath, selectedProfile: profileDirectory }
  }

  const browserDef = findChromiumBrowserDefinition(browser.family)
  if (!browserDef) {
    return null
  }
  const root = browserRootPath(browserDef)
  if (!root) {
    return null
  }
  const profileDir = join(root, profileDirectory)
  const cookiesPath = resolveChromiumCookiesPath(profileDir)
  if (!cookiesPath) {
    return null
  }
  return {
    ...browser,
    cookiesPath,
    selectedProfile: profileDirectory
  }
}
