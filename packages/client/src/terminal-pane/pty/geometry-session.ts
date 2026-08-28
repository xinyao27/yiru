import { isPtyLocked } from '../pane-manager/mobile-driver-state'
import { getFitOverrideForPty } from '../pane-manager/mobile-fit-overrides'
import type { ManagedPane } from '../pane-manager/pane-manager'
import { safeFit, safeFitAndThen } from '../pane-manager/pane-tree-ops'
import { createDesktopGeometry } from './desktop-geometry'
import { createPtyResizeForwarder } from './resize-forwarder'
import { createPtySizeReassertion } from './size-reassertion'
import { reconcilePtySizeAcrossFrames, type PtySizeReconcileHandle } from './size-reconcile'
import type { PtyTransport } from './transport-types'

type GeometrySessionOptions = {
  pane: ManagedPane
  transport: PtyTransport
  getIsDisposed: () => boolean
  getIsVisible: () => boolean
}

export type GeometrySession = {
  shouldSuppressDesktopResize: () => boolean
  isRendererResizeAuthoritative: () => boolean
  scheduleForegroundDriftCheck: () => void
  getBufferSwitches: () => number
  setSnapshotReplayResizeSuppressed: (suppressed: boolean) => void
  reconcileAfterSpawn: (ptyId: string, spawnCols: number, spawnRows: number) => void
  requestReassertion: () => void
  dispose: () => void
}

export function createGeometrySession(options: GeometrySessionOptions): GeometrySession {
  let isSnapshotReplayResizeSuppressed = false
  let isViewportClaimResizeSuppressed = false
  let bufferSwitches = 0
  let reconcileHandle: PtySizeReconcileHandle | null = null
  const bufferChange = options.pane.terminal.buffer.onBufferChange?.(() => {
    bufferSwitches += 1
  })
  const resizeForwarder = createPtyResizeForwarder({
    pane: options.pane,
    transport: options.transport,
    getIsVisible: options.getIsVisible,
    getSuppressSnapshotReplay: () => isSnapshotReplayResizeSuppressed,
    getSuppressViewportClaim: () => isViewportClaimResizeSuppressed
  })
  const sizeReassertion = createPtySizeReassertion({
    isDisposed: options.getIsDisposed,
    getPtyId: options.transport.getPtyId,
    isRemotePtyId: () => true,
    shouldSuppressDesktopResize: resizeForwarder.shouldSuppressDesktopResize,
    fitAndRun: (continuation) => safeFitAndThen(options.pane, 'pty-size-reassertion', continuation),
    getTerminalDimensions: () => ({
      cols: options.pane.terminal.cols,
      rows: options.pane.terminal.rows
    }),
    getAppliedSize: async () => ({
      cols: options.pane.terminal.cols,
      rows: options.pane.terminal.rows
    }),
    forwardResize: resizeForwarder.forward
  })
  const desktopGeometry = createDesktopGeometry({
    pane: options.pane,
    transport: options.transport,
    sizeReassertion,
    getIsDisposed: options.getIsDisposed,
    getIsVisible: options.getIsVisible,
    shouldSuppressDesktopResize: resizeForwarder.shouldSuppressDesktopResize,
    setViewportClaimResizeSuppressed: (suppressed) => {
      isViewportClaimResizeSuppressed = suppressed
    }
  })

  return {
    shouldSuppressDesktopResize: resizeForwarder.shouldSuppressDesktopResize,
    isRendererResizeAuthoritative: resizeForwarder.isRendererResizeAuthoritative,
    scheduleForegroundDriftCheck: desktopGeometry.scheduleForegroundDriftCheck,
    getBufferSwitches: () => bufferSwitches,
    setSnapshotReplayResizeSuppressed: (suppressed) => {
      isSnapshotReplayResizeSuppressed = suppressed
    },
    reconcileAfterSpawn: (ptyId, spawnCols, spawnRows) => {
      reconcileHandle?.cancel()
      reconcileHandle = reconcilePtySizeAcrossFrames({
        spawnCols,
        spawnRows,
        isAlive: () => !options.getIsDisposed() && options.transport.getPtyId() === ptyId,
        isParked: () => Boolean(getFitOverrideForPty(ptyId)) || isPtyLocked(ptyId),
        isAuthoritative: resizeForwarder.isRendererResizeAuthoritative,
        measure: () => {
          if (!safeFit(options.pane)) {
            return null
          }
          const cols = options.pane.terminal.cols
          const rows = options.pane.terminal.rows
          return cols > 0 && rows > 0 ? { cols, rows } : null
        },
        resize: (cols, rows) => {
          if (!resizeForwarder.shouldSuppressDesktopResize()) {
            options.transport.resize(cols, rows)
          }
        },
        getAppliedSize: undefined,
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => {
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(handle)
          }
        }
      })
    },
    requestReassertion: () => sizeReassertion.request({ fit: false }),
    dispose: () => {
      reconcileHandle?.cancel()
      reconcileHandle = null
      sizeReassertion.dispose()
      desktopGeometry.dispose()
      resizeForwarder.dispose()
      bufferChange?.dispose()
    }
  }
}
