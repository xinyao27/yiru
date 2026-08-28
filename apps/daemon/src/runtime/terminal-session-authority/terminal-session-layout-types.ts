export type TerminalDimensions = {
  cols: number
  rows: number
}

export type TerminalLayoutTarget =
  | ({ kind: 'desktop' } & TerminalDimensions)
  | ({ kind: 'phone'; ownerClientId: string } & TerminalDimensions)
  | ({ kind: 'remote-desktop'; ownerSubscriptionKey: string } & TerminalDimensions)

export type TerminalLayoutState = TerminalLayoutTarget & {
  seq: number
  appliedAt: number
}

export type TerminalLayoutResult =
  | { ok: true; state: TerminalLayoutState }
  | { ok: false; reason: 'pty-exited' | 'resize-failed' }

export type TerminalFitOverride = TerminalDimensions & {
  mode: 'mobile-fit'
  previousCols: number | null
  previousRows: number | null
  updatedAt: number
  clientId: string
}
