import { clampTerminalViewport } from '../model/review-branch'
import { RuntimeTerminalReclaimTerminalForDesktop } from './reclaim-terminal-for-desktop'

export abstract class RuntimeTerminalUpdateMobileSubscriberViewport extends RuntimeTerminalReclaimTerminalForDesktop {
  updateMobileSubscriberViewport(
    ptyId: string,
    clientId: string,
    viewport: { cols: number; rows: number }
  ): void {
    this.terminalSessions.setMobileViewport(ptyId, clientId, viewport)
  }

  // Why: server-side auto-fit on mobile subscribe. The runtime is the single
  // source of truth — the mobile client just passes its viewport and the runtime
  // decides whether to resize. This eliminates the measure→RPC→resubscribe
  // pipeline that caused race conditions.
  //
  // Multi-mobile keying: each subscriber lives in `mobileSubscribers[ptyId]`'s
  // inner map under its own clientId. Phone B subscribing does not overwrite
  // phone A's record — both stay until each unsubscribes.
  //
  // Subscribe-in-desktop-mode rule: a subscribe with displayMode='desktop' is
  // a passive watch; it does NOT take the floor. The driver remains
  // `idle`/`desktop`. The lock banner is reserved for actual mobile
  // interaction (input/resize/setDisplayMode/auto-or-phone subscribe).

  async handleMobileSubscribe(
    ptyId: string,
    clientId: string,
    viewport?: { cols: number; rows: number }
  ): Promise<boolean> {
    try {
      return await this.handleMobileSubscribeInternal(ptyId, clientId, viewport)
    } finally {
      // Every subscribe path mutates mobileSubscribers — resync the daemon
      // background mark once, whatever branch returned.
      this.notifyRemoteTerminalViewPresenceChanged(ptyId)
    }
  }

  protected async handleMobileSubscribeInternal(
    ptyId: string,
    clientId: string,
    viewport?: { cols: number; rows: number }
  ): Promise<boolean> {
    const mode = this.getMobileDisplayMode(ptyId)

    // Cancel pending restore timer for this ptyId — any new subscriber
    // supersedes any old client's pending restore.
    this.terminalSessions.cancelMobileRestoreTimer(ptyId)

    // Resubscribe-grace honor: same client returning within soft-leave
    // window restores prior record (preserving baseline so we don't capture
    // phone-fitted dims as the new baseline).
    const softLeaver = this.terminalSessions.getMobileSoftLeaver(ptyId)
    if (softLeaver && softLeaver.clientId === clientId) {
      this.terminalSessions.takeMobileSoftLeaver(ptyId)
      this.terminalSessions.setMobileSubscriber(ptyId, {
        ...softLeaver.record,
        viewport: viewport ?? null,
        lastActedAt: Date.now()
      })
      if (!viewport) {
        return false
      }
      this.setDriver(ptyId, { kind: 'mobile', clientId })
      if (mode !== 'desktop') {
        const { cols: clampedCols, rows: clampedRows } = clampTerminalViewport(
          viewport.cols,
          viewport.rows
        )
        await this.enqueueLayout(
          ptyId,
          {
            kind: 'phone',
            cols: clampedCols,
            rows: clampedRows,
            ownerClientId: clientId
          },
          true
        )
      }
      return true
    }

    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)

    // Capture restore baseline BEFORE applyLayout writes the override.
    // Multi-mobile: peer joiner against an already-fitted PTY captures null
    // — the existing baseline-holder's snapshot remains canonical. See
    // docs/mobile-presence-lock.md.
    //
    // Resubscribe-after-indefinite-hold: the held override carries the only
    // authoritative pre-fit dims across the no-subscriber gap. Inherit it
    // first; otherwise rendererSize/currentSize would be the held phone dims
    // and applyLayout would clobber the override's previousCols with phone
    // dims, making any subsequent Restore a no-op.
    const heldOverride = this.terminalSessions.getFitOverride(ptyId)
    const existing = this.terminalSessions.getMobileSubscriber(ptyId, clientId)
    const someoneAlreadyFitted = subscribers.some((subscriber) => subscriber.wasResizedToPhone)
    const currentSize = this.getTerminalSize(ptyId)
    const rendererSize = this.terminalSessions.getLastRendererSize(ptyId)
    const previousCols =
      existing?.previousCols ??
      heldOverride?.previousCols ??
      (someoneAlreadyFitted ? null : (rendererSize?.cols ?? currentSize?.cols ?? null))
    const previousRows =
      existing?.previousRows ??
      heldOverride?.previousRows ??
      (someoneAlreadyFitted ? null : (rendererSize?.rows ?? currentSize?.rows ?? null))
    const now = Date.now()
    const subscribedAt = existing?.subscribedAt ?? now

    if (!viewport) {
      // Why: mobile can subscribe before its WebView has measured. Keep the
      // subscriber + desktop baseline so updateViewport/setDisplayMode can
      // late-bind the viewport without recapturing phone dims.
      this.terminalSessions.setMobileSubscriber(ptyId, {
        clientId,
        viewport: null,
        wasResizedToPhone: false,
        previousCols,
        previousRows,
        subscribedAt,
        lastActedAt: now
      })
      return false
    }

    const { cols: clampedCols, rows: clampedRows } = clampTerminalViewport(
      viewport.cols,
      viewport.rows
    )

    if (mode === 'desktop') {
      // Passive watch — null baseline (we'll capture later if user toggles
      // to auto/phone, since safeFit will have converged by then). Do not
      // flip driver.
      this.terminalSessions.setMobileSubscriber(ptyId, {
        clientId,
        viewport,
        wasResizedToPhone: false,
        previousCols: null,
        previousRows: null,
        subscribedAt,
        lastActedAt: now
      })
      return false
    }

    this.terminalSessions.setMobileSubscriber(ptyId, {
      clientId,
      viewport,
      wasResizedToPhone: true,
      previousCols,
      previousRows,
      subscribedAt,
      lastActedAt: now
    })

    // Subscribe-fresh with auto/phone counts as "take the floor".
    this.setDriver(ptyId, { kind: 'mobile', clientId })

    await this.enqueueLayout(
      ptyId,
      {
        kind: 'phone',
        cols: clampedCols,
        rows: clampedRows,
        ownerClientId: clientId
      },
      true
    )

    return true
  }

  // Why: delayed restore prevents resize thrashing during rapid tab switches.
  // The 300ms debounce means only the final tab triggers a PTY restore;
  // intermediate terminals keep their current dims harmlessly.
  //
  // Multi-mobile: only the last subscriber leaving for this ptyId triggers
  // restore + driver=idle. Peer mobile clients still on the inner map keep
  // the lock banner mounted; if the disconnecting client was the active
  // driver, we re-elect the most-recent surviving subscriber.
}
