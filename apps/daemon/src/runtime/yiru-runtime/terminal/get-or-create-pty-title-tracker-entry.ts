import { createCommandCodeOutputStatusDetector } from '@yiru/runtime-protocol/workbench/command-code-output-status'
import type { TerminalGitHubPRLink } from '@yiru/runtime-protocol/workbench/terminal/github-pr-link-detector'
import { createTerminalTitleTracker } from '~main/terminal-output/output-side-effects'

import type { RuntimePtyTitleTrackerEntry } from '../model/terminal-observation'
import { RuntimeTerminalNotePtyDataGap } from './note-pty-data-gap'

export abstract class RuntimeTerminalGetOrCreatePtyTitleTrackerEntry extends RuntimeTerminalNotePtyDataGap {
  protected getOrCreatePtyTitleTrackerEntry(ptyId: string): RuntimePtyTitleTrackerEntry {
    const existing = this.ptyTitleTrackersByPtyId.get(ptyId)
    if (existing) {
      return existing
    }
    // Why: trackers are created lazily on the first observed chunk. After an
    // app relaunch the PTY/leaf records can already hold a persisted title; a
    // cold tracker would miss the parked working→idle completion and never
    // arm the stale-title timer for a persisted 'working' title.
    let initialTitle = this.terminalSessions.getPtyRecord(ptyId)?.lastOscTitle ?? null
    if (initialTitle === null) {
      for (const leaf of this.getLeavesForPty(ptyId)) {
        if (leaf.lastOscTitle) {
          initialTitle = leaf.lastOscTitle
          break
        }
      }
    }
    const tracker = createTerminalTitleTracker(
      {
        onTitle: (normalizedTitle, rawTitle, meta) => {
          this.recordTerminalSideEffectFact(ptyId, {
            kind: 'title',
            normalizedTitle,
            rawTitle,
            ...(meta?.staleWorkingTitleClear ? { staleWorkingTitleClear: true } : {})
          })
          const changed = this.applyTrackedPtyTitle(ptyId, rawTitle, normalizedTitle)
          if (!changed) {
            return
          }
          const live = this.ptyTitleTrackersByPtyId.get(ptyId)
          const gateKey = this.makeMobileTitleGateKey(rawTitle, normalizedTitle)
          const decorativeOnly = live?.lastMobileTitleGateKey === gateKey
          if (live) {
            live.lastMobileTitleGateKey = gateKey
          }
          if (live?.applyingChunk) {
            // Why: synthetic spinner ticks change only the braille glyph
            // ~12.5x/sec; fanning out full mobile session snapshots per frame
            // is pure churn. Raw lastOscTitle updates above stay cheap.
            if (!(live.applyingSyntheticFrame && decorativeOnly)) {
              live.chunkTouchedSessionTabs = true
            }
          } else {
            // Stale-working-title timer path — fires between chunks, so the
            // per-chunk batching in onPtyData cannot pick it up.
            this.touchMobileSessionSnapshotsForPty(ptyId)
          }
        },
        // Why: agent transitions and bells become pty:sideEffect facts —
        // main is the single byte parser for local/SSH PTYs; the renderer
        // store handler decides what the facts mean (notification policy).
        onAgentBecameWorking: () => {
          this.recordTerminalSideEffectFact(ptyId, { kind: 'agent-working' })
        },
        onAgentBecameIdle: (title, meta) => {
          this.recordTerminalSideEffectFact(ptyId, {
            kind: 'agent-idle',
            title,
            ...(meta?.staleWorkingTitleClear ? { staleWorkingTitleClear: true } : {})
          })
        },
        onAgentExited: () => {
          this.recordTerminalSideEffectFact(ptyId, { kind: 'agent-exited' })
        },
        // Why: bell/command-finished/pr-link/2031 facts exist only for the
        // pty:sideEffect channel. Headless serve has no consumer, so skip the
        // per-chunk bell walk and 133/URL/2031 scans entirely.
        ...(this.terminalSideEffectConsumerAvailable
          ? {
              onBell: () => {
                this.recordTerminalSideEffectFact(ptyId, { kind: 'bell' })
              },
              onCommandFinished: (exitCode: number | null) => {
                this.recordTerminalSideEffectFact(ptyId, { kind: 'command-finished', exitCode })
              },
              onPrLink: (link: TerminalGitHubPRLink) => {
                this.recordTerminalSideEffectFact(ptyId, { kind: 'pr-link', link })
              },
              // Why: multiplex-gated views never see the bytes, so main
              // surfaces DECSET 2031 subscribes as facts; the theme reply is
              // still sent by the renderer (query authority stays with the view).
              onMode2031Subscribe: () => {
                this.recordTerminalSideEffectFact(ptyId, { kind: '2031-subscribe' })
              }
            }
          : {})
      },
      initialTitle !== null ? { initialTitle } : {}
    )
    const entry: RuntimePtyTitleTrackerEntry = {
      tracker,
      applyingChunk: false,
      applyingSyntheticFrame: false,
      lastMobileTitleGateKey: null,
      chunkTouchedSessionTabs: false,
      pendingFacts: [],
      // Why: command-code facts exist only for the pty:sideEffect channel —
      // headless serve skips the per-chunk scrape entirely. The detector
      // self-arms on the Command Code banner; the spawn command (when main
      // saw one) mirrors the renderer detector's startupCommand fast-arm.
      commandCodeDetector: this.terminalSideEffectConsumerAvailable
        ? createCommandCodeOutputStatusDetector({
            startupCommand: this.terminalSpawnCommandsByPtyId.get(ptyId) ?? null,
            onWorking: (prompt) => {
              this.recordTerminalSideEffectFact(ptyId, { kind: 'command-code-working', prompt })
            },
            onDone: (prompt) => {
              this.recordTerminalSideEffectFact(ptyId, { kind: 'command-code-done', prompt })
            }
          })
        : null
    }
    this.ptyTitleTrackersByPtyId.set(ptyId, entry)
    return entry
  }

  /** Apply one observed OSC title (raw form) to the PTY and leaf records.
   *  Returns true when the PTY record's title or status changed. */
}
