import { clampTerminalViewport } from '../model/review-branch'
import type { DriverState } from '../model/worktree-resolution'
import { RuntimeTerminalUpdateRemoteDesktopViewer } from './update-remote-desktop-viewer'

export abstract class RuntimeTerminalBeginMobileInputFloor extends RuntimeTerminalUpdateRemoteDesktopViewer {
  beginMobileInputFloor(
    ptyId: string,
    clientId: string
  ): { commit: () => Promise<void>; rollback: () => void } | null {
    // Why: a client inside soft-leave grace may still reserve the floor; the
    // authority rejects post-grace or orphaned writers before changing driver.
    return this.terminalSessions.beginMobileInputFloor(
      ptyId,
      clientId,
      (previousFloor, isCurrent) => this.mobileTookFloor(ptyId, clientId, previousFloor, isCurrent)
    )
  }

  // Why: invoked from mobile RPC method handlers (terminal.send / setDisplayMode /
  // resizeForClient / fresh subscribe with auto). Records the actor as the
  // most recent mobile driver and re-applies phone-fit if we were previously
  // in `desktop` mode (mobile reclaims a take-back). Mobile-to-mobile hand-offs
  // are no-ops for resize.

  async mobileTookFloor(
    ptyId: string,
    clientId: string,
    previousFloor?: DriverState,
    isCurrent: () => boolean = () => true
  ): Promise<void> {
    const sub = this.terminalSessions.getMobileSubscriber(ptyId, clientId)
    const softLeaver = this.terminalSessions.getMobileSoftLeaver(ptyId)
    // Why: only a current or recently disconnected subscriber may reclaim the
    // input floor; otherwise a stale client could override the desktop lock.
    if (!sub && softLeaver?.clientId !== clientId) {
      return
    }
    this.terminalSessions.markMobileActor(ptyId, clientId)
    const prev = previousFloor ?? this.getDriver(ptyId)
    const currentMode = this.terminalSessions.getMobileDisplayMode(ptyId)
    // Why: a deliberate mobile action implies mobile is resuming control.
    // If the display mode is currently 'desktop' (set by an earlier
    // take-back), flip it back to 'auto' (= map absence) and re-apply so
    // phone-fit takes hold again. See docs/mobile-presence-lock.md.
    if (prev.kind === 'desktop' || currentMode === 'desktop') {
      if (currentMode === 'desktop') {
        this.terminalSessions.setMobileDisplayMode(ptyId, 'auto')
      }
      await this.applyMobileDisplayMode(ptyId)
    }
    // Why: display changes are async; a later PTY write must keep the floor
    // when an older phone-fit operation eventually completes.
    if (!isCurrent()) {
      return
    }
    this.setDriver(ptyId, { kind: 'mobile', clientId })
  }

  // Why: in-place viewport update on the existing mobile subscription —
  // used when the mobile keyboard opens/closes and shrinks/grows the
  // visible terminal area. We refresh the subscriber's viewport, re-fit
  // the PTY to the new dims, and emit a 'resized' event so the mobile
  // xterm reinits inline at the new dims without re-subscribing. This
  // avoids the unsubscribe → resubscribe cycle which would (a) flash the
  // desktop lock banner during the brief idle gap and (b) cause the new
  // subscribe to capture the already-phone-fitted PTY size as its
  // restore baseline (stuck-dim bug on later disconnect).
  // No-op when the client isn't actually subscribed to this PTY.

  async updateMobileViewport(
    ptyId: string,
    clientId: string,
    viewport: { cols: number; rows: number }
  ): Promise<{ updated: boolean; applied: boolean }> {
    if (!this.terminalSessions.recordMobileViewportActivity(ptyId, clientId, viewport)) {
      return { updated: false, applied: false }
    }
    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)

    const mode = this.getMobileDisplayMode(ptyId)
    if (mode === 'desktop') {
      // Watching at desktop dims — viewport is informational only.
      return { updated: true, applied: false }
    }
    // Drive PTY dims by the most-recent-actor (just updated to this client).
    const winner = this.pickMostRecentActor(subscribers)
    if (!winner) {
      return { updated: false, applied: false }
    }
    const winnerSub = this.terminalSessions.getMobileSubscriber(ptyId, winner.clientId)
    const driveViewport = winnerSub?.viewport ?? viewport
    const { cols: clampedCols, rows: clampedRows } = clampTerminalViewport(
      driveViewport.cols,
      driveViewport.rows
    )

    this.terminalSessions.setMobilePhoneFit(ptyId, clientId, true)
    // The driver is already mobile{this client} when we got here; refresh
    // to update lastActedAt-based ordering on later actor selection.
    this.setDriver(ptyId, { kind: 'mobile', clientId })

    const result = await this.enqueueLayout(
      ptyId,
      {
        kind: 'phone',
        cols: clampedCols,
        rows: clampedRows,
        ownerClientId: winner.clientId
      },
      !this.terminalSessions.hasLayout(ptyId)
    )
    return { updated: true, applied: result.ok }
  }

  // Why: invoked from `runtime:restoreTerminalFit` IPC (the desktop "Take
  // back" / "Restore" button). Forces the PTY back to desktop dims and flips
  // the driver to `desktop`, suppressing further mobile-driven dim changes
  // until a mobile actor takes the floor again. The remote-viewer case releases
  // its viewport floor through the same user-facing restore action. The three
  // mobile cases each end in releaseDesktopTakeBack:
  //   1. Active mobile subscriber: route through applyMobileDisplayMode so the
  //      existing 'resized' event reaches the phone.
  //   2. Held override, no subscriber (post-indefinite-hold): resolve the
  //      restore target and enqueueLayout directly.
  //   3. Stale mobile driver, no subscriber and no override: nothing to resize,
  //      just drop the lock. See docs/mobile-fit-hold.md.
  //
  // Why: explicit desktop take-back is a user command to reclaim input control
  // NOW. Unlike the auto-restore timer and phone-initiated setDisplayMode paths
  // (which keep the lock when a resize can't converge, #7588), this gesture
  // ALWAYS drops the presence lock and banner. "Take back all terminals"
  // reclaims several PTYs at once; a background pane whose desktop resize can't
  // converge must not strand its banner on the other terminals. The resize is
  // best-effort — the desktop renderer refits the PTY on its next settled
  // frame. Returns `true` whenever there was a lock to reclaim, `false` only
  // when there was nothing to reclaim.
}
