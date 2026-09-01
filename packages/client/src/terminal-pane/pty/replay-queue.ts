import type { ManagedPane } from '../pane-manager/pane-manager'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import type { ReplayWriter } from './replay-writer'

export type ReplayDataMeta = {
  clearBeforeReplay?: boolean
  pendingEscapeTailAnsi?: string
  snapshotCols?: number
  snapshotRows?: number
  onParsed?: () => void
}

type ReplayQueueOptions = {
  pane: ManagedPane
  writer: ReplayWriter
  structuralCoordinator: TerminalStructuralReplayCoordinator
  getIsDisposed: () => boolean
  getPtyId: () => string | null
  getStreamGeneration: () => number
  preparePayload: (data: string, clearBeforeReplay: boolean) => void
  getResetSequence: (data: string) => string
  afterReset: (ptyId: string | null, streamGeneration: number) => void
  rebuildWebgl: () => void
  beginLiveDataDeferral: (streamGeneration: number) => void
  finishLiveDataDeferral: (completed: boolean, streamGeneration: number) => void
}

type PendingReplayData = {
  data: string
  clearBeforeReplay: boolean
  ptyId: string | null
  generation: number
  streamGeneration: number
  pendingEscapeTailAnsi?: string
  snapshotCols?: number
  snapshotRows?: number
  onParsed?: () => void
}

export function createReplayQueue(options: ReplayQueueOptions): {
  enqueue: (data: string, meta?: ReplayDataMeta, streamGeneration?: number) => void
} {
  let writeQueue = Promise.resolve()
  let pendingReplay: PendingReplayData | null = null
  let payloadGeneration = 0
  let isDrainQueued = false

  const drain = async (
    expectedPtyId: string | null,
    expectedStreamGeneration: number
  ): Promise<boolean> => {
    let didApplyCurrentPayload = false
    while (pendingReplay !== null) {
      if (
        pendingReplay.ptyId !== expectedPtyId ||
        pendingReplay.streamGeneration !== expectedStreamGeneration
      ) {
        return false
      }
      if (
        options.getPtyId() !== expectedPtyId ||
        options.getStreamGeneration() !== expectedStreamGeneration
      ) {
        pendingReplay = null
        return false
      }
      const payload = pendingReplay
      pendingReplay = null
      const isCurrentPayload = (): boolean =>
        !options.getIsDisposed() &&
        payload.generation === payloadGeneration &&
        payload.streamGeneration === options.getStreamGeneration() &&
        options.getPtyId() === payload.ptyId
      if (!isCurrentPayload()) {
        continue
      }
      if (
        payload.snapshotCols &&
        payload.snapshotRows &&
        (options.pane.terminal.cols !== payload.snapshotCols ||
          options.pane.terminal.rows !== payload.snapshotRows)
      ) {
        options.pane.terminal.resize(payload.snapshotCols, payload.snapshotRows)
      }
      if (payload.clearBeforeReplay) {
        await options.writer.writeAsync('\x1b[2J\x1b[3J\x1b[H')
        if (!isCurrentPayload()) {
          continue
        }
      }
      if (payload.clearBeforeReplay || payload.data.length > 0) {
        options.preparePayload(payload.data, payload.clearBeforeReplay)
      }
      await options.writer.writeAsync(payload.data)
      if (!isCurrentPayload()) {
        continue
      }
      if (payload.clearBeforeReplay || payload.data.length > 0) {
        await options.writer.writeAsync(options.getResetSequence(payload.data))
        if (!isCurrentPayload()) {
          continue
        }
        options.afterReset(payload.ptyId, payload.streamGeneration)
      }
      // Why: the daemon separates a read ending mid-escape. Write that tail
      // last so the reset ESC cannot abort it before the next live chunk.
      if (payload.pendingEscapeTailAnsi) {
        await options.writer.writeAsync(payload.pendingEscapeTailAnsi)
      }
      if (!isCurrentPayload()) {
        continue
      }
      options.rebuildWebgl()
      payload.onParsed?.()
      didApplyCurrentPayload = true
    }
    return didApplyCurrentPayload
  }

  const scheduleDrain = (): void => {
    if (isDrainQueued) {
      return
    }
    const scheduledPtyId = pendingReplay?.ptyId ?? null
    const scheduledStreamGeneration =
      pendingReplay?.streamGeneration ?? options.getStreamGeneration()
    isDrainQueued = true
    // Why: live bytes are newer than replay. Hold them until clear, replay and
    // reset all parse, or replay can erase the newer stream.
    options.beginLiveDataDeferral(scheduledStreamGeneration)
    let didComplete = false
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() =>
        options.structuralCoordinator.run(
          async () => {
            didComplete = await drain(scheduledPtyId, scheduledStreamGeneration)
          },
          {
            shouldRestore: () =>
              !options.getIsDisposed() &&
              options.getPtyId() === scheduledPtyId &&
              options.getStreamGeneration() === scheduledStreamGeneration
          }
        )
      )
      .then(() => {
        didComplete &&= !options.getIsDisposed() && options.getPtyId() === scheduledPtyId
      })
      .finally(() => {
        isDrainQueued = false
        if (pendingReplay !== null) {
          scheduleDrain()
        }
        options.finishLiveDataDeferral(didComplete, scheduledStreamGeneration)
      })
  }

  return {
    enqueue: (data, meta = {}, streamGeneration = options.getStreamGeneration()) => {
      pendingReplay = {
        data,
        clearBeforeReplay: meta.clearBeforeReplay !== false,
        ptyId: options.getPtyId(),
        generation: (payloadGeneration += 1),
        streamGeneration,
        ...(meta.pendingEscapeTailAnsi
          ? { pendingEscapeTailAnsi: meta.pendingEscapeTailAnsi }
          : {}),
        ...(meta.snapshotCols ? { snapshotCols: meta.snapshotCols } : {}),
        ...(meta.snapshotRows ? { snapshotRows: meta.snapshotRows } : {}),
        ...(meta.onParsed ? { onParsed: meta.onParsed } : {})
      }
      scheduleDrain()
    }
  }
}
