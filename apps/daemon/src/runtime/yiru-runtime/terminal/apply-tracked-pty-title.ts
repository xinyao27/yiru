import { isWindowsAbsolutePathLike } from '@yiru/runtime-protocol/model/platform'
import { splitWorktreeIdForFilesystem } from '@yiru/runtime-protocol/model/workspace'
import { detectAgentStatusFromTitle } from '@yiru/runtime-protocol/workbench/agent/detection'
import type { TerminalChunkScanFlags } from '@yiru/runtime-protocol/workbench/terminal/chunk-scan-flags'
import { parseFileUriPathParts } from '~main/daemon/osc7-file-uri'
import { extractLastOsc7Uri, extractOscScanTail } from '~main/daemon/osc7-uri-extraction'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeTerminalGetOrCreatePtyTitleTrackerEntry } from './get-or-create-pty-title-tracker-entry'

export abstract class RuntimeTerminalApplyTrackedPtyTitle extends RuntimeTerminalGetOrCreatePtyTitleTrackerEntry {
  protected applyTrackedPtyTitle(
    ptyId: string,
    rawTitle: string,
    normalizedTitle: string
  ): boolean {
    // Why: status is detected from the RAW title (mirrors the renderer tracker),
    // so working/idle transitions are unaffected by normalization; the records
    // store the NORMALIZED title so rotating Grok/Pi/Gemini frames collapse to
    // one stable stored label (#7880) instead of churning `ps`/mobile tabs.
    const agentStatus = detectAgentStatusFromTitle(rawTitle)
    let ptyRecordChanged = false
    this.terminalSessions.mutatePtyOutputState(ptyId, ({ pty, leaves }) => {
      if (pty) {
        const prevStatus = pty.lastAgentStatus
        const prevTitle = pty.lastOscTitle
        const observedAt = this.nextTitleObservationSequence()
        pty.lastOscTitle = normalizedTitle
        pty.lastOscTitleAt = observedAt
        pty.lastAgentStatus = agentStatus
        this.setPtyManagementTitleFromObservedTitle(pty, normalizedTitle, observedAt)
        ptyRecordChanged = prevTitle !== normalizedTitle || prevStatus !== agentStatus
        if (agentStatus === 'idle' && prevStatus !== 'idle') {
          this.resolvePtyTuiIdleWaiters(pty, ptyId)
        }
        const shouldDelayMobileSnapshot =
          ptyRecordChanged &&
          this.shouldDelayPtyBackedMobileSnapshotForForegroundAgent(pty, normalizedTitle)
        let foregroundRefresh: Promise<boolean> | undefined
        // Why: status transitions, not spinner frames, pay the foreground-process probe.
        if (prevStatus !== agentStatus) {
          foregroundRefresh = this.refreshPtyForegroundAgentFromController(ptyId, {
            afterTitleObservation: observedAt
          })
        } else if (shouldDelayMobileSnapshot) {
          foregroundRefresh = this.getPendingForegroundAgentRefreshForTitle(ptyId, observedAt)
        }
        if (foregroundRefresh && shouldDelayMobileSnapshot) {
          ptyRecordChanged = false
          this.delayPtyBackedMobileSnapshotForForegroundAgent(ptyId, observedAt, foregroundRefresh)
        }
      }
      for (const leaf of leaves) {
        // Why: keep the latest OSC title on the leaf so worktree.ps can
        // recompute status from the live title each call. Without this,
        // daemon-hosted terminals (no renderer pushing pane titles) had no
        // way to clear a stale 'working' status after the agent exited and
        // the shell took over the title — the stuck-spinner bug in #1437.
        leaf.lastOscTitle = normalizedTitle
        leaf.lastOscTitleAt = this.nextTitleObservationSequence()
        const prevStatus = leaf.lastAgentStatus
        // Why: when a new OSC title doesn't classify as an agent state (e.g.
        // bare shell title after the agent exits), clear lastAgentStatus so
        // it is no longer sticky. Tui-idle waiters that needed the previous
        // 'idle' transition were already resolved at the moment of the
        // transition below; only fresh waiters registered after the agent
        // exits would observe the cleared value, and they correctly fall
        // back to title-based detection / polling.
        leaf.lastAgentStatus = agentStatus
        // Why: resolve tui-idle on any transition TO idle (not just working→idle).
        // Claude Code may skip "working" entirely on fast tasks, going null→idle,
        // and the coordinator's tui-idle waiter would hang forever waiting for a
        // working→idle transition that never comes. Permission→idle is excluded:
        // it means the agent was blocked on user approval and the user said no,
        // which isn't a task-completion signal.
        if (agentStatus === 'idle' && prevStatus !== 'idle') {
          this.resolveTuiIdleWaiters(leaf)
          this.deliverPendingMessages(leaf)
        }
      }
    })
    return ptyRecordChanged
  }

  /** Cancel the per-PTY title tracker (stale-title timer included) on PTY
   *  teardown so it cannot fire into pruned records. */

  protected disposePtyTitleTracker(ptyId: string): void {
    this.ptyTitleTrackersByPtyId.get(ptyId)?.tracker.dispose()
    this.ptyTitleTrackersByPtyId.delete(ptyId)
  }

  protected resetTrackedTerminalStateForProviderGeneration(ptyId: string): void {
    // Why: a replacement daemon session can reuse the PTY id, but title/parser
    // state from the prior process must not bleed into its snapshots or chunks.
    this.disposePtyTitleTracker(ptyId)
    this.oscTitleScanTailByPtyId.delete(ptyId)
    this.osc7ScanTailByPtyId.delete(ptyId)
    this.agentStatusOscProcessorsByPtyId.delete(ptyId)
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    if (pty) {
      pty.lastOscTitle = null
      pty.lastOscTitleAt = null
      pty.lastAgentStatus = null
      pty.managementTitle = null
      pty.managementTitleAt = null
      this.terminalSessions.commitPtyState(ptyId, { pty })
    }
    const updatedLeaves = this.terminalSessions.getGraphLeavesForPty(ptyId)
    for (const leaf of updatedLeaves) {
      leaf.lastOscTitle = null
      leaf.lastOscTitleAt = null
      leaf.lastAgentStatus = null
    }
    this.terminalSessions.commitPtyState(ptyId, { leaves: updatedLeaves })
    this.clearAgentRowSnapshotsForPty(ptyId)
  }

  protected setTerminalSideEffectConsumerAvailable(available: boolean): void {
    this.desktopTerminalSideEffectConsumerAvailable =
      available && this.onTerminalSideEffects !== null
    this.refreshTerminalSideEffectConsumerAvailability()
  }

  protected refreshTerminalSideEffectConsumerAvailability(): void {
    const nextAvailable =
      this.desktopTerminalSideEffectConsumerAvailable ||
      this.terminalMultiplexSideEffectListeners.size > 0
    if (nextAvailable === this.terminalSideEffectConsumerAvailable) {
      return
    }
    this.terminalSideEffectConsumerAvailable = nextAvailable
    // Why: optional bell/command/link scanners are selected when a tracker is
    // created. Rebuild at the window boundary so pure headless output stays cheap.
    for (const ptyId of this.ptyTitleTrackersByPtyId.keys()) {
      this.disposePtyTitleTracker(ptyId)
    }
  }

  protected extractLastOsc7CwdForPty(
    ptyId: string,
    data: string,
    scanFlags?: TerminalChunkScanFlags
  ): { path: string; hostname: string } | null {
    const previousTail = this.osc7ScanTailByPtyId.get(ptyId)
    if (!previousTail && !(scanFlags?.hasOscIntroducer ?? data.includes('\x1b]7;'))) {
      return null
    }
    const input = `${previousTail ?? ''}${data}`
    const scanTail = extractOscScanTail(input, 4096)
    if (scanTail.length > 0) {
      this.osc7ScanTailByPtyId.set(ptyId, scanTail)
    } else {
      this.osc7ScanTailByPtyId.delete(ptyId)
    }
    const uri = extractLastOsc7Uri(input)
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    const pathFlavor = this.pathFlavorForPty(pty)
    return uri
      ? parseFileUriPathParts(uri, {
          pathFlavor,
          remotePosixAuthority: !!pty?.connectionId && pathFlavor !== 'win32'
        })
      : null
  }

  protected recordOsc7MetadataForPty(
    ptyId: string,
    data: string,
    scanFlags?: TerminalChunkScanFlags
  ): { cwd: string | null; cwdChanged: boolean } {
    const osc7 = this.extractLastOsc7CwdForPty(ptyId, data, scanFlags)
    const cwd = osc7?.path ?? null
    const cwdChanged =
      cwd !== null && cwd.trim().length > 0 && this.terminalCwdByPtyId.get(ptyId) !== cwd
    if (cwdChanged) {
      this.terminalCwdByPtyId.set(ptyId, cwd)
    }
    if (osc7) {
      if (osc7.hostname) {
        this.terminalFileUriHostnameByPtyId.set(ptyId, osc7.hostname)
      } else {
        this.terminalFileUriHostnameByPtyId.delete(ptyId)
      }
    }
    return { cwd, cwdChanged }
  }

  protected pathFlavorForPty(pty?: RuntimePtyWorktreeRecord | null): 'posix' | 'win32' {
    if (!pty?.connectionId) {
      return process.platform === 'win32' ? 'win32' : 'posix'
    }
    const worktreePath = splitWorktreeIdForFilesystem(pty.worktreeId)?.worktreePath
    return worktreePath && isWindowsAbsolutePathLike(worktreePath) ? 'win32' : 'posix'
  }

  /** Returns true when any retained agent-row snapshot changed in a
   *  client-visible way, so the caller can republish session snapshots. */
}
