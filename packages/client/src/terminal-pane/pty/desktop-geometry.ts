import { getFitOverrideForPty } from '../pane-manager/mobile-fit-overrides'
import { requestStablePaneFit } from '../pane-manager/pane-fit-resize-observer'
import type { ManagedPane } from '../pane-manager/pane-manager'
import { deferTerminalGeometryMutationDuringRebuild } from '../pane-manager/terminal-scroll-intent-rebuild'
import type { ManagedPaneInternal } from '../pane-manager/types'
import { shouldClaimRemoteDesktopViewport } from '../remote-desktop-viewport-claim'
import type { PtySizeReassertion } from './size-reassertion'
import { FOREGROUND_GRID_DRIFT_CHECK_MIN_MS } from './terminal-output-policy'
import type { PtyTransport } from './transport-types'

type DesktopGeometryOptions = {
  pane: ManagedPane
  transport: PtyTransport
  sizeReassertion: PtySizeReassertion
  getIsDisposed: () => boolean
  getIsVisible: () => boolean
  shouldSuppressDesktopResize: () => boolean
  setViewportClaimResizeSuppressed: (suppressed: boolean) => void
}

export type DesktopGeometry = {
  scheduleForegroundDriftCheck: () => void
  dispose: () => void
}

export function createDesktopGeometry(options: DesktopGeometryOptions): DesktopGeometry {
  let pendingDriftFrame: number | null = null
  let lastDriftCheckAt = Number.NEGATIVE_INFINITY
  let pendingReportFrame: number | null = null
  let lastObservedGrid: { cols: number; rows: number } | null = null
  let hasPendingPaneGeometryChange = false

  const readProposedGrid = (): { cols: number; rows: number } | null => {
    try {
      const proposed = options.pane.fitAddon.proposeDimensions()
      return proposed && proposed.cols > 0 && proposed.rows > 0 ? proposed : null
    } catch {
      return null
    }
  }

  const scheduleForegroundDriftCheck = (): void => {
    if (
      options.getIsDisposed() ||
      !options.getIsVisible() ||
      options.shouldSuppressDesktopResize() ||
      pendingDriftFrame !== null
    ) {
      return
    }
    const now = performance.now()
    if (now - lastDriftCheckAt < FOREGROUND_GRID_DRIFT_CHECK_MIN_MS) {
      return
    }
    lastDriftCheckAt = now
    pendingDriftFrame = requestAnimationFrame(() => {
      pendingDriftFrame = null
      const proposed = readProposedGrid()
      if (
        options.getIsDisposed() ||
        !options.getIsVisible() ||
        options.shouldSuppressDesktopResize() ||
        !proposed ||
        (options.pane.terminal.cols === proposed.cols &&
          options.pane.terminal.rows === proposed.rows)
      ) {
        return
      }
      // Why: cell metrics can settle after the DOM box stops resizing, so a
      // ResizeObserver may never fire for this drift.
      requestStablePaneFit(options.pane as ManagedPaneInternal, () =>
        options.sizeReassertion.request({ fit: false })
      )
    })
  }

  const readPaneSize = (): { width: number; height: number } | null => {
    if (typeof options.pane.container.getBoundingClientRect !== 'function') {
      return null
    }
    const rect = options.pane.container.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }
  let lastObservedPaneSize = readPaneSize()

  const handleObservedGeometry = (): void => {
    pendingReportFrame = null
    if (options.getIsDisposed()) {
      return
    }
    if (
      deferTerminalGeometryMutationDuringRebuild(
        options.pane.terminal,
        'observed-pane-geometry',
        handleObservedGeometry
      )
    ) {
      return
    }
    const paneGeometryChanged = hasPendingPaneGeometryChange
    hasPendingPaneGeometryChange = false
    const ptyId = options.transport.getPtyId()
    if (!ptyId) {
      // Why: the observer may run before binding. Preserve this baseline so
      // the first focused resize is not swallowed as its initial measurement.
      const proposed = readProposedGrid()
      if (proposed) {
        lastObservedGrid = proposed
      }
      return
    }
    const fitOverride = getFitOverrideForPty(ptyId)
    if (!fitOverride) {
      if (options.pane.terminal.cols > 0 && options.pane.terminal.rows > 0) {
        lastObservedGrid = {
          cols: options.pane.terminal.cols,
          rows: options.pane.terminal.rows
        }
      }
      if (!options.shouldSuppressDesktopResize()) {
        requestStablePaneFit(options.pane as ManagedPaneInternal, () =>
          options.sizeReassertion.request({ fit: false })
        )
      }
      return
    }
    const proposed = readProposedGrid()
    if (!proposed) {
      return
    }
    const priorProposed = lastObservedGrid
    lastObservedGrid = proposed
    if (fitOverride.mode !== 'remote-desktop-fit') {
      options.transport.resize(proposed.cols, proposed.rows)
      return
    }
    if (
      !shouldClaimRemoteDesktopViewport({
        holdMode: fitOverride.mode,
        prior: priorProposed,
        current: proposed,
        paneGeometryChanged,
        paneVisible: options.getIsVisible(),
        documentVisible: document.visibilityState !== 'hidden',
        documentFocused: document.hasFocus()
      })
    ) {
      return
    }
    // Why: release the parked grid in xterm before claiming it for desktop so
    // the owner never renders the prior driver's dimensions.
    options.setViewportClaimResizeSuppressed(true)
    try {
      options.pane.terminal.resize(proposed.cols, proposed.rows)
    } finally {
      options.setViewportClaimResizeSuppressed(false)
    }
    options.transport.resize(proposed.cols, proposed.rows, { claim: true })
  }

  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          const paneSize = readPaneSize()
          if (
            paneSize &&
            lastObservedPaneSize &&
            (paneSize.width !== lastObservedPaneSize.width ||
              paneSize.height !== lastObservedPaneSize.height)
          ) {
            hasPendingPaneGeometryChange = true
          }
          lastObservedPaneSize = paneSize
          if (pendingReportFrame === null) {
            pendingReportFrame = requestAnimationFrame(handleObservedGeometry)
          }
        })
  if (observer && options.pane.container instanceof Element) {
    observer.observe(options.pane.container)
  }

  return {
    scheduleForegroundDriftCheck,
    dispose: () => {
      observer?.disconnect()
      if (pendingDriftFrame !== null) {
        cancelAnimationFrame(pendingDriftFrame)
        pendingDriftFrame = null
      }
      if (pendingReportFrame !== null) {
        cancelAnimationFrame(pendingReportFrame)
        pendingReportFrame = null
      }
    }
  }
}
