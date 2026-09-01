import { isPtyLocked } from '../pane-manager/mobile-driver-state'
import { getFitOverrideForPty } from '../pane-manager/mobile-fit-overrides'
import type { ManagedPane } from '../pane-manager/pane-manager'
import {
  PANE_PTY_RESIZE_HOLD_FLUSH_EVENT,
  queuePanePtyResizeIfHeld,
  type PanePtyResizeHoldFlushDetail
} from '../pane-manager/pane-pty-resize-hold'
import type { PtyTransport } from './transport-types'

type PtyResizeForwarderOptions = {
  pane: ManagedPane
  transport: PtyTransport
  getIsVisible: () => boolean
  getSuppressSnapshotReplay: () => boolean
  getSuppressViewportClaim: () => boolean
}

export type PtyResizeForwarder = {
  shouldSuppressDesktopResize: () => boolean
  isRendererResizeAuthoritative: () => boolean
  forward: (cols: number, rows: number) => void
  dispose: () => void
}

export function createPtyResizeForwarder(options: PtyResizeForwarderOptions): PtyResizeForwarder {
  const shouldSuppressDesktopResize = (): boolean => {
    const ptyId = options.transport.getPtyId()
    return Boolean(ptyId && (getFitOverrideForPty(ptyId) || isPtyLocked(ptyId)))
  }

  const isRendererResizeAuthoritative = (): boolean => {
    // Why: hidden-tab layout churn is not authoritative; visible resume owns
    // correction, and a hidden SIGWINCH can reset full-screen TUIs.
    return options.getIsVisible()
  }

  const forward = (cols: number, rows: number): void => {
    if (!isRendererResizeAuthoritative() || shouldSuppressDesktopResize()) {
      return
    }
    if (queuePanePtyResizeIfHeld(options.pane.container, cols, rows)) {
      return
    }
    options.transport.resize(cols, rows, { claim: true })
  }

  const onHeldResizeFlush = (event: Event): void => {
    // Why: the event name fixes the producer contract, but addEventListener's
    // DOM type erases CustomEvent detail at this seam.
    const detail = (event as CustomEvent<PanePtyResizeHoldFlushDetail>).detail
    if (detail) {
      forward(detail.cols, detail.rows)
    }
  }
  options.pane.container.addEventListener(PANE_PTY_RESIZE_HOLD_FLUSH_EVENT, onHeldResizeFlush)

  const resizeDisposable = options.pane.terminal.onResize(({ cols, rows }) => {
    if (options.getSuppressSnapshotReplay() || options.getSuppressViewportClaim()) {
      return
    }
    forward(cols, rows)
  })

  return {
    shouldSuppressDesktopResize,
    isRendererResizeAuthoritative,
    forward,
    dispose: () => {
      resizeDisposable.dispose()
      options.pane.container.removeEventListener(
        PANE_PTY_RESIZE_HOLD_FLUSH_EVENT,
        onHeldResizeFlush
      )
    }
  }
}
