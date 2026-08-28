import type {
  BrowserCookieImportResult,
  BrowserCertificateFailure,
  BrowserLoadError,
  BrowserSessionProfile,
  BrowserSessionProfileSource
} from '../types'

export type BrowserSnapshotRef = {
  ref: string
  role: string
  name: string
}

export type BrowserSnapshotResult = {
  browserPageId: string
  snapshot: string
  refs: BrowserSnapshotRef[]
  url: string
  title: string
}

export type BrowserClickResult = {
  clicked: string
}

export type BrowserGotoResult = {
  url: string
  title: string
}

export type BrowserFillResult = {
  filled: string
}

export type BrowserTypeResult = {
  typed: boolean
}

export type BrowserSelectResult = {
  selected: string
}

export type BrowserScrollResult = {
  scrolled: 'up' | 'down'
}

export type BrowserBackResult = {
  url: string
  title: string
}

export type BrowserReloadResult = {
  url: string
  title: string
}

export type BrowserScreenshotResult = {
  data: string
  format: 'png' | 'jpeg'
}

export type BrowserScreencastReadyResult = {
  type: 'ready'
  subscriptionId: string
  browserPageId: string
  format: 'jpeg' | 'png'
  tab: BrowserTabInfo
}

export type BrowserScreencastEndResult = {
  type: 'end'
  subscriptionId: string
}

export type BrowserScreencastDialogResult = {
  type: 'dialog'
  dialogType: string
  message: string
}

export type BrowserScreencastDialogClosedResult = {
  type: 'dialogClosed'
}

export type BrowserScreencastErrorResult = {
  type: 'error'
  message: string
}

export type BrowserScreencastResult =
  | BrowserScreencastReadyResult
  | BrowserScreencastEndResult
  | BrowserScreencastDialogResult
  | BrowserScreencastDialogClosedResult
  | BrowserScreencastErrorResult

export type BrowserEvalResult = {
  result: string
  origin: string
}

export type BrowserTabInfo = {
  browserPageId: string
  index: number
  url: string
  title: string
  active: boolean
  // Why: a failed load leaves getURL() at chrome-error://; surface the structured
  // error so an agent driving the browser can tell a bypassable certificate
  // failure from an ordinary network error the way the UI can.
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
  family: BrowserSessionProfileSource['browserFamily']
  label: string
  profiles: BrowserDetectedProfileInfo[]
  selectedProfile: string
}

export type BrowserDetectProfilesResult = {
  browsers: BrowserDetectedInfo[]
}

export type BrowserProfileImportFromBrowserResult = BrowserCookieImportResult

export type BrowserProfileClearDefaultCookiesResult = {
  cleared: boolean
}

export type BrowserHoverResult = {
  hovered: string
}

export type BrowserDragResult = {
  dragged: { from: string; to: string }
}

export type BrowserUploadResult = {
  uploaded: number
}

export type BrowserWaitResult = {
  waited: boolean
}

export type BrowserCheckResult = {
  checked: boolean
}

export type BrowserFocusResult = {
  focused: string
}

export type BrowserClearResult = {
  cleared: string
}

export type BrowserSelectAllResult = {
  selected: string
}

export type BrowserKeypressResult = {
  pressed: string
}

export type BrowserPdfResult = {
  data: string
}
