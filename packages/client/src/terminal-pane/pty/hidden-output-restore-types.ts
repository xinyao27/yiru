import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'

import type { ManagedPane } from '../pane-manager/pane-manager'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import type { HiddenRendererQuery } from './hidden-renderer-query'
import type { OrderedOutputSequence } from './ordered-output-sequence'
import type { PtyBufferSnapshot } from './transport-types'

export type HiddenOutputRestoreOptions = {
  pane: ManagedPane
  coordinator: TerminalStructuralReplayCoordinator
  query: HiddenRendererQuery
  orderedOutput: OrderedOutputSequence
  shouldSnapshotHiddenOutput: boolean
  getIsDisposed: () => boolean
  getPtyId: () => string | null
  canUseSnapshot: (ptyId: string | null) => ptyId is string
  getIsForeground: () => boolean
  getIsActive: () => boolean
  ensureWritePipelineAvailable: () => boolean
  serializeSnapshot: (ptyId: string) => Promise<PtyBufferSnapshot | null>
  writeForeground: (data: string) => void
  writeReplayData: (data: string) => void
  hasLiveAgent: () => boolean
  isRendererPtyResizeAuthoritative: () => boolean
  resizePty: (cols: number, rows: number) => void
  setSuppressPtyResize: (suppress: boolean) => void
  resetHiddenRendererRisk: () => void
  resetSkippedRendererRisk: () => void
  onRestoreSettled: () => void
  writeUnavailableWarning: () => void
  discardTerminalOutput: () => void
  warnIterationCap: (ptyId: string, reason: 'drained' | 'overflow' | 'refetch') => void
}

export type HiddenOutputRestoreController = {
  getState: () => { appliesToCurrentPty: boolean; isNeeded: boolean; isInFlight: boolean }
  markNeeded: () => void
  markFreshSnapshotNeeded: () => void
  shouldSkipRendererOutput: (foreground: boolean, data: string) => boolean
  skipRendererOutput: (data: string) => void
  queueLiveChunk: (data: string, meta?: PtyDataMeta) => void
  request: () => boolean
  clear: () => void
  cancelSnapshotReplay: () => void
  resetIfPtyChanged: () => void
  isForegroundBackpressure: () => boolean
  noteFloodBackpressure: () => void
  markRendererStateDirty: () => void
  dispose: () => void
}
