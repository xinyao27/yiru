import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'

import type { TerminalGitHubPRLink } from '../../shared/terminal/github-pr-link-detector'

export type PtyTransientFact =
  | { kind: 'bell' }
  | { kind: 'command-finished'; exitCode: number | null }
  | { kind: 'pr-link'; link: TerminalGitHubPRLink }
  | { kind: '2031-subscribe' }

export type PtyBackgroundStreamEvent =
  | { id: string; kind: 'backgroundMarker'; background: boolean; scanSeedAnsi?: string }
  | { id: string; kind: 'dataGap'; droppedChars: number; sequenceChars?: number }
  | { id: string; kind: 'transientFact'; fact: PtyTransientFact }

export type PtyProviderBufferSnapshot = {
  data: string
  /** Authoritative normal buffer captured beside an alternate-screen frame. */
  scrollbackAnsi?: string
  cols: number
  rows: number
  cwd?: string | null
  lastTitle?: string
  seq: number
  source: 'headless'
  oscLinks?: TerminalOscLinkRange[]
  alternateScreen?: boolean
  pendingEscapeTailAnsi?: string
}
