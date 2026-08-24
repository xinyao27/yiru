import { advertisedUrlWatcher } from '~main/ports/advertised-url-watcher'
import { extractOscTitleScanTail } from '~shared/osc-title-scan-tail'

import { tailStateMatches } from '../model/terminal-control-parser'
import { normalizeTerminalChunk } from '../model/terminal-normalization'
import { appendNormalizedToTailBuffer } from '../model/terminal-tail-buffer'
import type { RetainedTailRedrawCursor } from '../model/terminal-tail-redraw'
import {
  buildPreview,
  computeTerminalTailWaitState,
  tailGainedNewerBlockedReason
} from '../model/terminal-tail-state'
import { RuntimeTerminalPreAllocateHandleForPty } from './pre-allocate-handle-for-pty'

export abstract class RuntimeTerminalOnPtyData extends RuntimeTerminalPreAllocateHandleForPty {
  onPtyData(
    ptyId: string,
    data: string,
    at: number,
    sequenceChars = data.length,
    queryReplyOwner = this.getTerminalQueryReplyOwnerForLiveChunk(ptyId)
  ): number {
    const outputSequence = (this.ptyOutputSequenceById.get(ptyId) ?? 0) + sequenceChars
    this.ptyOutputSequenceById.set(ptyId, outputSequence)
    const wireByteLength = new TextEncoder().encode(data).byteLength
    const wireByteSequence =
      (this.ptyWireByteSequenceById.get(ptyId) ?? 0n) + BigInt(wireByteLength)
    this.ptyWireByteSequenceById.set(ptyId, wireByteSequence)
    this.providerModeTrackersByPtyId.get(ptyId)?.scan(data)
    for (const tracker of this.providerModeSnapshotScansByPtyId.get(ptyId) ?? []) {
      tracker.scan(data)
    }
    const osc7Metadata = this.recordOsc7MetadataForPty(ptyId, data)
    const cwd = osc7Metadata.cwd
    const cwdChanged = osc7Metadata.cwdChanged
    const agentStatusChunk = this.processAgentStatusOscForPty(ptyId, data)
    this.recordRecentPtyOutputForPathProvenance(ptyId, data)
    // Agent detection runs on raw data before leaf processing, since the
    // tail buffer logic normalizes away the OSC sequences we need.
    this.agentDetector?.onData(ptyId, data, at)
    // Why: watch terminal output for advertised dev-server URLs (e.g. Vite's
    // `Network: https://local.example.com:3001/`) so the workspace ports
    // panel can surface them in place of the kernel bind address.
    advertisedUrlWatcher.ingest(ptyId, data, at)
    // Why: reply ownership is captured at ingestion and rides the write-chain
    // link. A delivery-state flip before the queued emulator write runs must
    // not change who answers the query in this chunk.
    const forwardQueryReplies = queryReplyOwner === 'model'
    // Our structure wins: OSC title/agent-status extraction runs through the
    // shared per-PTY title tracker below (getOrCreatePtyTitleTrackerEntry →
    // applyTrackedPtyTitle) in byte order, superseding main's inline
    // extractLastOscTitleForPty block (#7880/#7852 title/status semantics are
    // preserved via the tracker + detectAgentStatusFromTitle path).
    this.trackHeadlessTerminalData(
      ptyId,
      data,
      outputSequence,
      wireByteSequence,
      forwardQueryReplies
    )

    if (!this.terminalSessions.hasPtyRecord(ptyId)) {
      this.getOrCreatePtyWorktreeRecord(ptyId)
    }
    let ptyTailBefore: {
      lines: string[]
      partialLine: string
      pendingAnsi: string
      redrawCursor: RetainedTailRedrawCursor | null
      truncated: boolean
      linesTotal: number
    } | null = null
    let ptyTailAfter: ReturnType<typeof appendNormalizedToTailBuffer> | null = null
    let normalizedPtyText: string | null = null
    this.terminalSessions.mutatePtyOutputState(ptyId, ({ pty }) => {
      if (!pty) {
        return
      }
      ptyTailBefore = {
        lines: pty.tailBuffer,
        partialLine: pty.tailPartialLine,
        pendingAnsi: pty.tailPendingAnsi,
        redrawCursor: pty.tailRedrawCursor,
        truncated: pty.tailTruncated,
        linesTotal: pty.tailLinesTotal
      }
      pty.connected = true
      pty.disconnectedAt = null
      pty.lastOutputAt = at
      const normalized = normalizeTerminalChunk(data, pty.tailPendingAnsi)
      normalizedPtyText = normalized.text
      pty.tailPendingAnsi = normalized.pendingAnsi
      const nextTail = appendNormalizedToTailBuffer(
        pty.tailBuffer,
        pty.tailPartialLine,
        normalized.text,
        pty.tailRedrawCursor
      )
      ptyTailAfter = nextTail
      pty.tailBuffer = nextTail.lines
      pty.tailPartialLine = nextTail.partialLine
      pty.tailRedrawCursor = nextTail.redrawCursor
      pty.tailTruncated = pty.tailTruncated || nextTail.truncated
      pty.tailLinesTotal += nextTail.newCompleteLines
      pty.preview = buildPreview(pty.tailBuffer, pty.tailPartialLine)
    })
    if (normalizedPtyText !== null) {
      this.scheduleWaitBlockedCheck(ptyId, normalizedPtyText, at)
    }

    const boundWorktreeIds = new Set<string>()
    this.terminalSessions.mutatePtyOutputState(ptyId, ({ pty, leaves, graphReady }) => {
      for (const leaf of leaves) {
        const paneKey = this.makeRuntimePaneKey(leaf)
        this.terminalSessions.recordLivePtyBinding(ptyId, {
          worktreeId: leaf.worktreeId,
          preserveExistingWorktree: false,
          lastOutputAt: pty?.lastOutputAt ?? at,
          preview: pty?.preview ?? leaf.preview,
          tabId: leaf.tabId,
          paneKey
        })
        boundWorktreeIds.add(leaf.worktreeId)
        leaf.connected = true
        leaf.writable = graphReady
        leaf.lastOutputAt = at
        if (
          pty &&
          ptyTailBefore &&
          ptyTailAfter &&
          tailStateMatches(
            leaf.tailBuffer,
            leaf.tailPartialLine,
            leaf.tailPendingAnsi,
            leaf.tailRedrawCursor,
            leaf.tailTruncated,
            leaf.tailLinesTotal,
            ptyTailBefore
          )
        ) {
          // Why: the leaf and PTY record mirror one terminal; reuse its single tail update.
          leaf.tailBuffer = pty.tailBuffer
          leaf.tailPartialLine = pty.tailPartialLine
          leaf.tailPendingAnsi = pty.tailPendingAnsi
          leaf.tailRedrawCursor = pty.tailRedrawCursor
          leaf.tailTruncated = pty.tailTruncated
          leaf.tailLinesTotal = pty.tailLinesTotal
          leaf.preview = pty.preview
          leaf.waitBlockedAt = pty.waitBlockedAt
          leaf.tailWaitState = pty.tailWaitState
        } else {
          const normalized = normalizeTerminalChunk(data, leaf.tailPendingAnsi)
          leaf.tailPendingAnsi = normalized.pendingAnsi
          const previousWaitState =
            leaf.tailWaitState?.fromTail === true
              ? leaf.tailWaitState
              : computeTerminalTailWaitState(leaf.tailBuffer, leaf.tailPartialLine, leaf.preview)
          const nextTail = appendNormalizedToTailBuffer(
            leaf.tailBuffer,
            leaf.tailPartialLine,
            normalized.text,
            leaf.tailRedrawCursor
          )
          const nextWaitState = computeTerminalTailWaitState(
            nextTail.lines,
            nextTail.partialLine,
            leaf.preview
          )
          if (tailGainedNewerBlockedReason(previousWaitState, nextWaitState, normalized.text)) {
            leaf.waitBlockedAt = at
          }
          leaf.tailWaitState = nextWaitState
          leaf.tailBuffer = nextTail.lines
          leaf.tailPartialLine = nextTail.partialLine
          leaf.tailRedrawCursor = nextTail.redrawCursor
          leaf.tailTruncated = leaf.tailTruncated || nextTail.truncated
          leaf.tailLinesTotal += nextTail.newCompleteLines
          leaf.preview = buildPreview(leaf.tailBuffer, leaf.tailPartialLine)
        }
      }
    })
    for (const worktreeId of boundWorktreeIds) {
      advertisedUrlWatcher.bindPty(ptyId, worktreeId)
    }

    // Why: feed the chunk's OSC titles through the shared per-PTY tracker in
    // byte order — the same ordering the renderer transport uses — so
    // coalesced working→idle transitions reach tui-idle waiters and
    // pending-message delivery instead of being masked by the chunk's last
    // title (issue #1083). Uses the OSC 9999-stripped cleanData like the
    // renderer, so pure status chunks don't perturb the stale-title probe.
    const titleTrackerEntry = this.getOrCreatePtyTitleTrackerEntry(ptyId)
    const previousTitleScanTail = this.oscTitleScanTailByPtyId.get(ptyId)
    const titleInput = previousTitleScanTail
      ? `${previousTitleScanTail}${agentStatusChunk.cleanData}`
      : agentStatusChunk.cleanData
    const nextTitleScanTail = extractOscTitleScanTail(titleInput)
    if (nextTitleScanTail.length > 0) {
      this.oscTitleScanTailByPtyId.set(ptyId, nextTitleScanTail)
    } else {
      this.oscTitleScanTailByPtyId.delete(ptyId)
    }
    titleTrackerEntry.applyingChunk = true
    titleTrackerEntry.chunkTouchedSessionTabs = false
    let retainedAgentStatusChanged = false
    try {
      titleTrackerEntry.tracker.handleChunk(agentStatusChunk.cleanData, {
        titleScanData: titleInput
      })
      // Why: the Command Code scrape rides the same per-chunk batch (its facts
      // trail the tracker's). cleanData keeps OSC 9999 payloads out of the
      // detector's bounded recent-text window; the detector strips remaining
      // control sequences itself, exactly like the renderer byte path.
      titleTrackerEntry.commandCodeDetector?.observe(agentStatusChunk.cleanData)
    } finally {
      titleTrackerEntry.applyingChunk = false
      try {
        // Why: per-chunk cross-channel contract order is status → titles →
        // bell — the chunk's agent-status events must reach the renderer
        // before its pty:sideEffect batch.
        retainedAgentStatusChanged = this.emitTerminalAgentStatusEvents(ptyId, agentStatusChunk)
      } finally {
        // Why: flushed in the finally so a throwing tracker callback cannot
        // strand this chunk's facts to be emitted under the next chunk's seq.
        this.flushPendingTerminalSideEffectFacts(ptyId, titleTrackerEntry)
      }
    }
    // Why: hook (OSC 9999) transitions often arrive without a title change, so
    // headless-serve snapshots would never republish and paired remote clients
    // kept the stale agent state until the next title change (#7970).
    if (titleTrackerEntry.chunkTouchedSessionTabs || retainedAgentStatusChanged) {
      this.touchMobileSessionSnapshotsForPty(ptyId)
    }

    this.terminalSessions.emitData(ptyId, data, {
      seq: outputSequence,
      rawLength: data.length,
      wireByteSeq: wireByteSequence,
      wireByteLength,
      ...(cwdChanged && cwd !== null ? { cwd } : {})
    })
    return outputSequence
  }
}
