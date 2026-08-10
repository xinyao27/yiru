export type BrowserWireValue =
  | null
  | boolean
  | number
  | string
  | BrowserWireValue[]
  | { [key: string]: BrowserWireValue }

// Agent Browser's generic command surface returns the decoded JSON `data`
// member. Some successful commands intentionally omit that member.
export type BrowserAgentCommandResult = BrowserWireValue | undefined

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

export type BrowserNavigationResult = {
  url: string
  title: string
}

export type BrowserGotoResult = BrowserNavigationResult
export type BrowserBackResult = BrowserNavigationResult
export type BrowserForwardResult = BrowserNavigationResult
export type BrowserReloadResult = BrowserNavigationResult

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

export type BrowserScreenshotResult = {
  data: string
  format: 'png' | 'jpeg'
}

export type BrowserEvalResult = {
  result: string
  origin: string
}

export type BrowserHoverResult = {
  hovered: string
}

export type BrowserDragResult = {
  dragged: {
    from: string
    to: string
  }
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

export type BrowserConsoleEntry = {
  level: string
  text: string
  timestamp: number
  url?: string
  line?: number
}

export type BrowserConsoleResult = {
  entries: BrowserConsoleEntry[]
  truncated: boolean
}

export type BrowserNetworkEntry = {
  url: string
  method: string
  status: number
  mimeType: string
  size: number
  timestamp: number
}

export type BrowserNetworkLogResult = {
  entries: BrowserNetworkEntry[]
  truncated: boolean
}

export type BrowserCaptureStartResult = {
  capturing: boolean
}

export type BrowserCaptureStopResult = {
  stopped: boolean
}

export type BrowserCertificateProceedFailureReason =
  | 'expired'
  | 'changed'
  | 'ineligible'
  | 'missing'
  | 'navigated'

export type BrowserCertificateProceedResult =
  | { ok: true }
  | { ok: false; reason: BrowserCertificateProceedFailureReason }

export type BrowserScreencastUnsubscribeResult = {
  unsubscribed: true
}

export type BrowserKeyboardInsertTextResult = BrowserAgentCommandResult
export type BrowserScrollIntoViewResult = BrowserAgentCommandResult
export type BrowserGetResult = BrowserAgentCommandResult
export type BrowserIsResult = BrowserAgentCommandResult
export type BrowserFindResult = BrowserAgentCommandResult
export type BrowserExecResult = BrowserAgentCommandResult
export type BrowserDownloadResult = BrowserAgentCommandResult
export type BrowserHighlightResult = BrowserAgentCommandResult
