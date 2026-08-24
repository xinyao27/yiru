import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'
import type { ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'
import type { HeadlessEmulator } from '~main/daemon/headless-emulator'
import type { PtyProviderBufferSnapshot } from '~main/providers/types'
import type { PtyProcessInfo } from '~main/providers/types'
import type { TerminalTitleTracker } from '~shared/terminal/output-side-effects'
import type { TerminalSideEffectFact } from '~shared/terminal/side-effect-facts'
import type { WorktreeStartupLaunch, TuiAgent } from '~shared/types'

export type RuntimeTerminalAgentStatusEvent = {
  ptyId: string
  source: 'mounted-leaf' | 'pty-record'
  paneKey: string
  tabId?: string
  worktreeId?: string
  connectionId?: string | null
  payload: ParsedAgentStatusPayload
}

export type RuntimePtyTitleTrackerEntry = {
  tracker: TerminalTitleTracker
  // Why: onPtyData batches the mobile session-tab touch to once per chunk;
  // the stale-working-title timer fires between chunks and must touch
  // immediately. These flags route the tracker callback to the right mode.
  applyingChunk: boolean
  // Why: synthetic spinner ticks arrive ~12.5x/sec per working pane; the
  // synthetic path gates mobile snapshot fan-out on a non-decorative title
  // change (spinner glyph + status comparison key kept below).
  applyingSyntheticFrame: boolean
  lastMobileTitleGateKey: string | null
  chunkTouchedSessionTabs: boolean
  // Why: facts observed while applying a chunk are batched into one
  // pty:sideEffect emission per chunk, preserving byte order (titles in
  // sequence, then bell). Timer-fired facts emit immediately between chunks.
  pendingFacts: TerminalSideEffectFact[]
  // Why: Command Code lacks hooks, so its working/done state is scraped from
  // TUI output. Null when no side-effect consumer exists (headless serve) —
  // the scrape produces facts only.
  commandCodeDetector: { observe: (data: string) => boolean } | null
}

// Why: the full OSC 9999 payload flows through emitTerminalAgentStatusEvents and
// is then forwarded to the renderer and dropped. Mobile is served by the main
// process and has no renderer store, so we retain the latest payload per pane
// here to feed worktree.ps's inline agent rows (1:1 with the desktop sidebar).
export type RuntimeAgentRowSnapshot = {
  paneKey: string
  ptyId: string
  worktreeId?: string
  tabId?: string
  payload: ParsedAgentStatusPayload
  // When the current payload.state was first observed for this pane (ms).
  stateStartedAt: number
  updatedAt: number
}

export type RuntimeHeadlessTerminal = {
  emulator: HeadlessEmulator
  // Why: serialize can race with newer writes appended to writeChain; return
  // the seq actually painted into this emulator, not the latest PTY seq.
  outputSequence: number
  // Why: docs/reference/terminal-multiplex.md §11.2 forbids estimating UTF-8 byte position
  // from the legacy UTF-16 sequence. The authoritative model records both.
  wireByteSequence: bigint
  writeChain: Promise<void>
}

export type HeadlessSeedMetadata = {
  cwd?: string | null
  oscLinks?: TerminalOscLinkRange[]
  /** Cold restore history must outrank a model that only saw new-generation bytes. */
  preferProviderIfExisting?: boolean
  /** Persisted kitty flags from the daemon snapshot, re-applied to the fresh
   *  emulator so hidden `CSI ? u` answers the real flags instead of ?0u
   *  (terminal-query-authority.md §kitty). */
  kittyKeyboardFlags?: number
}

export type RuntimePtyController = {
  spawn?(opts: {
    cols: number
    rows: number
    cwd?: string
    cwdFallback?: 'worktree'
    command?: string
    launchAgent?: TuiAgent
    commandDelivery?: 'renderer' | 'provider'
    startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
    env?: Record<string, string>
    envToDelete?: string[]
    telemetry?: WorktreeStartupLaunch['telemetry']
    connectionId?: string | null
    worktreeId?: string
    preAllocatedHandle?: string
    tabId?: string
    leafId?: string
    sessionId?: string
    persistHostSessionBinding?: boolean
  }): Promise<{
    id: string
    startupCwdFallback?: { kind: 'worktree'; cwd: string }
  }>
  write(ptyId: string, data: string): boolean
  attach?(ptyId: string): Promise<void>
  kill(ptyId: string): boolean
  stopAndWait?(ptyId: string, opts?: { keepHistory?: boolean }): Promise<boolean>
  getCwd?(ptyId: string): Promise<string | null>
  getForegroundProcess(ptyId: string): Promise<string | null>
  confirmForegroundProcess?(ptyId: string): Promise<string | null>
  hasChildProcesses?(ptyId: string): Promise<boolean>
  clearBuffer?(ptyId: string): Promise<void>
  resize?(ptyId: string, cols: number, rows: number): boolean
  pauseProducer?(ptyId: string): void
  resumeProducer?(ptyId: string): void
  sendSignal?(ptyId: string, signal: string): Promise<void>
  // Why: exact-id Mobile polls should not enumerate every local and SSH PTY.
  hasPty?(ptyId: string): boolean | null
  listProcesses?(): Promise<PtyProcessInfo[]>
  /** Authoritative provider-owned snapshot for restored PTYs with no mounted renderer. */
  serializeProviderBuffer?(
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ): Promise<PtyProviderBufferSnapshot | null>
  getSize?(ptyId: string): { cols: number; rows: number } | null
}
