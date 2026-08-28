import {
  detectAgentStatusFromTitle,
  isCursorNativeAgentTitle,
  normalizeTerminalTitle
} from '@yiru/runtime-protocol/workbench/agent/detection'
import type {
  TerminalSideEffectBatch,
  TerminalSideEffectFact
} from '@yiru/runtime-protocol/workbench/terminal/side-effect-facts'
import { stripBrailleSpinnerGlyphs } from '~main/terminal-output/output-side-effects'

import { RuntimeTerminalScheduleWaitBlockedCheck } from './schedule-wait-blocked-check'

export abstract class RuntimeTerminalNotePtyDataGap extends RuntimeTerminalScheduleWaitBlockedCheck {
  notePtyDataGap(ptyId: string, droppedChars = 0): void {
    if (droppedChars > 0) {
      // Why: the daemon snapshot's seq counts bytes its monitoring stream
      // dropped. Advancing without parsing preserves that absolute domain so
      // post-snapshot live chunks can be reconciled instead of duplicated.
      const outputSequence = (this.ptyOutputSequenceById.get(ptyId) ?? 0) + droppedChars
      this.ptyOutputSequenceById.set(ptyId, outputSequence)
    }
    const pty = this.getOrCreatePtyWorktreeRecord(ptyId)
    if (pty) {
      pty.tailPendingAnsi = ''
      this.terminalSessions.commitPtyState(ptyId, { pty })
    }
    const updatedLeaves = this.terminalSessions.getGraphLeavesForPty(ptyId)
    for (const leaf of updatedLeaves) {
      leaf.tailPendingAnsi = ''
    }
    this.terminalSessions.commitPtyState(ptyId, { leaves: updatedLeaves })
    this.oscTitleScanTailByPtyId.delete(ptyId)
    this.osc7ScanTailByPtyId.delete(ptyId)
    this.agentStatusOscProcessorsByPtyId.delete(ptyId)
    this.disposeHeadlessTerminal(ptyId)
    const wireByteSeq = this.getTerminalWireByteSequence(ptyId)
    for (const listener of this.terminalMultiplexRestoreListeners.get(ptyId) ?? []) {
      listener(wireByteSeq, 'provider-gap')
    }
  }

  /** Record one derived side-effect fact: batched per chunk while applying
   *  bytes, emitted immediately for between-chunk facts (stale-title timer). */

  protected recordTerminalSideEffectFact(ptyId: string, fact: TerminalSideEffectFact): void {
    if (!this.terminalSideEffectConsumerAvailable) {
      return
    }
    const entry = this.ptyTitleTrackersByPtyId.get(ptyId)
    if (entry?.applyingChunk) {
      entry.pendingFacts.push(fact)
      return
    }
    this.emitTerminalSideEffectBatch(ptyId, [fact])
  }

  protected emitTerminalSideEffectBatch(
    ptyId: string,
    facts: TerminalSideEffectFact[],
    options: { replay?: boolean } = {}
  ): void {
    if (!this.terminalSideEffectConsumerAvailable || facts.length === 0) {
      return
    }
    const batch: TerminalSideEffectBatch = {
      ptyId,
      seq: this.ptyOutputSequenceById.get(ptyId) ?? 0,
      facts,
      ...(options.replay ? { replay: true } : {}),
      ...this.resolveTerminalSideEffectAttribution(ptyId)
    }
    if (this.desktopTerminalSideEffectConsumerAvailable && this.onTerminalSideEffects) {
      try {
        this.onTerminalSideEffects(batch)
      } catch (err) {
        console.error('[runtime] terminal side-effect listener threw', { ptyId, err })
      }
    }
    for (const listener of this.terminalMultiplexSideEffectListeners.get(ptyId) ?? []) {
      try {
        listener(batch, this.getTerminalWireByteSequence(ptyId))
      } catch (err) {
        console.error('[runtime] terminal multiplex side-effect listener threw', { ptyId, err })
      }
    }
  }

  /** Same attribution resolution as emitTerminalAgentStatusEvents: prefer the
   *  first mounted leaf, fall back to the spawn-time PTY record binding. */

  protected resolveTerminalSideEffectAttribution(ptyId: string): {
    worktreeId?: string
    tabId?: string
    paneKey?: string
    connectionId?: string | null
  } {
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    const connectionId = pty?.connectionId ?? null
    for (const leaf of this.getLeavesForPty(ptyId)) {
      return {
        worktreeId: leaf.worktreeId,
        tabId: leaf.tabId,
        paneKey: this.makeRuntimePaneKey(leaf),
        connectionId
      }
    }
    if (pty?.paneKey) {
      return {
        worktreeId: pty.worktreeId,
        ...(pty.tabId ? { tabId: pty.tabId } : {}),
        paneKey: pty.paneKey,
        connectionId
      }
    }
    return {}
  }

  /** Title-only replay batch for renderer (re)attach — the no-attention-replay
   *  rule: snapshots restore title state, never historical bells/completions. */

  getTerminalSideEffectSnapshot(ptyId: string): TerminalSideEffectBatch | null {
    const tracker = this.ptyTitleTrackersByPtyId.get(ptyId)?.tracker
    const recordTitle = this.terminalSessions.getPtyRecord(ptyId)?.lastOscTitle
    // Why: the cursor-agent literal drop applies to every title surface; a
    // record-fallback snapshot must not replay the bare native title the
    // tracker would have refused to emit live.
    const rawTitle = recordTitle && !isCursorNativeAgentTitle(recordTitle) ? recordTitle : null
    const normalizedTitle = tracker?.getLastNormalizedTitle() ?? null
    if (normalizedTitle === null && !rawTitle) {
      return null
    }
    return {
      ptyId,
      seq: this.ptyOutputSequenceById.get(ptyId) ?? 0,
      replay: true,
      facts: [
        {
          kind: 'title',
          normalizedTitle: normalizedTitle ?? normalizeTerminalTitle(rawTitle!),
          rawTitle: rawTitle ?? normalizedTitle!
        }
      ],
      ...this.resolveTerminalSideEffectAttribution(ptyId)
    }
  }

  /** Raw last title from main's tracked PTY/leaf records — the title surface
   *  the tracker (live bytes + synthetic frames) keeps current. */

  protected getTrackedRawTitleForPty(ptyId: string): string | null {
    const recordTitle = this.terminalSessions.getPtyRecord(ptyId)?.lastOscTitle
    if (recordTitle) {
      return recordTitle
    }
    for (const leaf of this.getLeavesForPty(ptyId)) {
      if (leaf.lastOscTitle) {
        return leaf.lastOscTitle
      }
    }
    return null
  }

  /** Why: synthetic agent title frames do not ride terminal output, so neither
   *  renderer xterm nor the headless emulator observes them. Mobile-parity
   *  snapshot titles must prefer main's tracker over snapshot lastTitle, or
   *  hook-driven spinner/idle titles vanish from mobile tabs. */

  protected makeMobileTitleGateKey(rawTitle: string, normalizedTitle: string): string {
    return `${detectAgentStatusFromTitle(rawTitle) ?? ''}\u0000${stripBrailleSpinnerGlyphs(
      normalizedTitle
    )}`
  }
}
