export type BrowserLoadError = {
  code: number
  description: string
  validatedUrl: string
}

export type BrowserCertificateFailure = {
  challengeId: string
  browserPageId: string
  errorCode: number | null
  error: string
  origin: string
  displayHost: string
  canProceed: boolean
  observedAt: number
}

export type BrowserTabInfo = {
  browserPageId: string
  index: number
  url: string
  title: string
  active: boolean
  loadError?: BrowserLoadError | null
  certificateFailure?: BrowserCertificateFailure | null
  worktreeId?: string | null
  profileId?: string | null
  profileLabel?: string | null
}

export type BrowserTabListResult = {
  tabs: BrowserTabInfo[]
}

export type BrowserTabSwitchResult = {
  switched: number
  browserPageId: string
}

export type BrowserTabCreateResult = {
  browserPageId: string
}

export type BrowserTabCloseResult = {
  closed: boolean
}

export type BrowserTabSetProfileResult = {
  browserPageId: string
  profileId: string | null
  profileLabel: string | null
}

export type BrowserTabShowResult = {
  tab: BrowserTabInfo
}

export type BrowserTabCurrentResult = {
  tab: BrowserTabInfo
}

export type BrowserTabProfileShowResult = {
  browserPageId: string
  worktreeId: string | null
  profileId: string | null
  profileLabel: string | null
}

export type BrowserTabProfileCloneResult = {
  browserPageId: string
  sourceBrowserPageId: string
  profileId: string | null
  profileLabel: string | null
}

export type BrowserSessionProfileScope = 'default' | 'isolated' | 'imported'

export type BrowserFamily =
  | 'chrome'
  | 'chromium'
  | 'arc'
  | 'edge'
  | 'firefox'
  | 'safari'
  | 'comet'
  | 'helium'
  | 'manual'

export type BrowserSessionProfileSource = {
  browserFamily: BrowserFamily
  profileName?: string
  importedAt: number
}

export type BrowserSessionProfile = {
  id: string
  scope: BrowserSessionProfileScope
  partition: string
  label: string
  source: BrowserSessionProfileSource | null
}

export type BrowserProfileListResult = {
  profiles: BrowserSessionProfile[]
}

export type BrowserProfileCreateResult = {
  profile: BrowserSessionProfile | null
}

export type BrowserProfileDeleteResult = {
  deleted: boolean
  profileId: string
}

export type BrowserDetectedProfileInfo = {
  name: string
  directory: string
}

export type BrowserDetectedInfo = {
  family: BrowserFamily
  label: string
  profiles: BrowserDetectedProfileInfo[]
  selectedProfile: string
}

export type BrowserDetectProfilesResult = {
  browsers: BrowserDetectedInfo[]
}

export type BrowserCookieImportSummary = {
  totalCookies: number
  importedCookies: number
  skippedCookies: number
  domains: string[]
}

export type BrowserProfileImportFromBrowserResult =
  | {
      ok: true
      profileId: string
      summary: BrowserCookieImportSummary
    }
  | {
      ok: false
      reason: string
    }

export type BrowserProfileClearDefaultCookiesResult = {
  cleared: boolean
}
