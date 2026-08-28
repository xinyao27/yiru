import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'

export type TerminalSnapshot = {
  snapshotAnsi: string
  // Why: restorers must write this after their own post-replay resets so a PTY read that ended
  // mid-escape completes exactly as it did live.
  pendingEscapeTailAnsi?: string
  scrollbackAnsi: string
  oscLinks?: TerminalOscLinkRange[]
  rehydrateSequences: string
  cwd: string | null
  modes: TerminalModes
  cols: number
  rows: number
  scrollbackLines: number
  lastTitle?: string
  // Why: persisted snapshots from older runtimes do not carry the absolute ingest sequence.
  outputSequence?: number
}

export type TerminalModes = {
  bracketedPaste: boolean
  mouseTracking: boolean
  mouseTrackingMode?: 'none' | 'x10' | 'vt200' | 'drag' | 'any'
  sgrMouseMode?: boolean
  sgrMousePixelsMode?: boolean
  applicationCursor: boolean
  alternateScreen: boolean
  // Why: the daemon emulator needs the live kitty flags when reseeding; renderer replay keeps its
  // own deliberate reset authoritative.
  kittyKeyboardFlags?: number
}
