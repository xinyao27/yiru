import {
  POST_REPLAY_LIVE_AGENT_SNAPSHOT_RESET,
  POST_REPLAY_LIVE_SNAPSHOT_RESET
} from '../layout-serialization'
import { getFitOverrideForPty } from '../pane-manager/mobile-fit-overrides'
import type { ManagedPane } from '../pane-manager/pane-manager'
import { recordTerminalOutput } from '../pane-manager/pane-scroll'
import { discardTerminalOutput } from '../pane-manager/pane-terminal-output-scheduler'
import { safeFitAndThen, type SafeFitContinuationHandle } from '../pane-manager/pane-tree-ops'
import { cancelTerminalScrollIntentBufferRebuildCompletions } from '../pane-manager/terminal-scroll-intent-rebuild'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import { waitForTerminalReplayWritesParsed } from '../replay-guard'
import type { OrderedOutputSequence } from './ordered-output-sequence'
import type { PtyBufferSnapshot } from './transport-types'

type SnapshotRestore = {
  ptyId: string | null
  generation: number
  valid: boolean
  started: boolean
}

type HiddenOutputSnapshotReplayOptions = {
  pane: ManagedPane
  coordinator: TerminalStructuralReplayCoordinator
  orderedOutput: OrderedOutputSequence
  getIsDisposed: () => boolean
  getPtyId: () => string | null
  getGeneration: () => number
  setSuppressPtyResize: (suppress: boolean) => void
  writeReplayData: (data: string) => void
  hasLiveAgent: () => boolean
  isRendererPtyResizeAuthoritative: () => boolean
  resizePty: (cols: number, rows: number) => void
  onSnapshotApplied: () => void
  onCurrentRestoreSettled: () => void
}

export type HiddenOutputSnapshotReplay = {
  apply: (snapshot: PtyBufferSnapshot) => Promise<void>
  cancel: () => void
  retargetGeneration: (ptyId: string, generation: number) => void
}

export function createHiddenOutputSnapshotReplay(
  options: HiddenOutputSnapshotReplayOptions
): HiddenOutputSnapshotReplay {
  let activeRestore: SnapshotRestore | null = null
  let pendingFit: SafeFitContinuationHandle | null = null

  const isCurrent = (restore: SnapshotRestore): boolean =>
    restore.valid &&
    !options.getIsDisposed() &&
    options.getPtyId() === restore.ptyId &&
    options.getGeneration() === restore.generation

  const cancel = (): void => {
    pendingFit?.cancel()
    pendingFit = null
    const restore = activeRestore
    if (!restore) {
      return
    }
    restore.valid = false
    activeRestore = null
    if (restore.started) {
      cancelTerminalScrollIntentBufferRebuildCompletions(options.pane.terminal)
    }
    // Why: invalidation suppresses restoration, but queued bytes still own
    // the bracket until their FIFO sentinels prove parsing has finished.
  }

  const apply = async (snapshot: PtyBufferSnapshot): Promise<void> => {
    cancel()
    const restore: SnapshotRestore = {
      ptyId: options.getPtyId(),
      generation: options.getGeneration(),
      valid: true,
      started: false
    }
    activeRestore = restore
    const colsBeforeReplay = options.pane.terminal.cols
    const rowsBeforeReplay = options.pane.terminal.rows
    const hasSnapshotDimensions =
      Number.isFinite(snapshot.cols) &&
      Number.isFinite(snapshot.rows) &&
      snapshot.cols > 0 &&
      snapshot.rows > 0
    try {
      await options.coordinator.run(
        async () => {
          if (!isCurrent(restore)) {
            return
          }
          restore.started = true
          discardTerminalOutput(options.pane.terminal)
          if (
            hasSnapshotDimensions &&
            (options.pane.terminal.cols !== snapshot.cols ||
              options.pane.terminal.rows !== snapshot.rows)
          ) {
            // Why: xterm parses writes later. Keep snapshot dimensions until
            // the FIFO sentinel completes so serialized wraps stay exact.
            options.setSuppressPtyResize(true)
            try {
              options.pane.terminal.resize(snapshot.cols, snapshot.rows)
            } finally {
              options.setSuppressPtyResize(false)
            }
          }
          if (!snapshot.alternateScreen) {
            options.writeReplayData('\x1b[2J\x1b[3J\x1b[H')
          } else if (snapshot.scrollbackAnsi !== undefined) {
            options.writeReplayData('\x1b[?1049l\x1b[2J\x1b[3J\x1b[H')
            options.writeReplayData(snapshot.scrollbackAnsi)
            options.writeReplayData('\x1b[0m\x1b[?1049h\x1b[2J\x1b[H')
          } else {
            // Why: clearing the active alternate buffer prevents the old frame
            // bleeding through blank cells without touching normal scrollback.
            options.writeReplayData('\x1b[0m\x1b[?1049h\x1b[2J\x1b[H')
          }
          options.writeReplayData(snapshot.data)
          options.writeReplayData(
            options.hasLiveAgent()
              ? POST_REPLAY_LIVE_AGENT_SNAPSHOT_RESET
              : POST_REPLAY_LIVE_SNAPSHOT_RESET
          )
          if (snapshot.pendingEscapeTailAnsi) {
            // Why last: the main emulator was mid-escape; a later ESC would
            // abort the dangling sequence before the racing live tail completes it.
            options.writeReplayData(snapshot.pendingEscapeTailAnsi)
          }
          options.orderedOutput.recordRendered(snapshot)
          options.onSnapshotApplied()
          recordTerminalOutput(options.pane.terminal)
          await waitForTerminalReplayWritesParsed(options.pane.terminal)
        },
        {
          shouldRestore: () => isCurrent(restore),
          afterRestore: async () => {
            if (!isCurrent(restore)) {
              return
            }
            const currentPtyId = options.getPtyId()
            if (!currentPtyId || getFitOverrideForPty(currentPtyId)) {
              return
            }
            const fit = safeFitAndThen(
              options.pane,
              'hidden-snapshot-pty-resize',
              () => {
                if (!isCurrent(restore) || options.getPtyId() !== currentPtyId) {
                  return
                }
                const replayChangedDimensions = hasSnapshotDimensions
                  ? options.pane.terminal.cols !== snapshot.cols ||
                    options.pane.terminal.rows !== snapshot.rows
                  : options.pane.terminal.cols !== colsBeforeReplay ||
                    options.pane.terminal.rows !== rowsBeforeReplay
                if (replayChangedDimensions && options.isRendererPtyResizeAuthoritative()) {
                  options.resizePty(options.pane.terminal.cols, options.pane.terminal.rows)
                }
              },
              { shouldContinue: () => isCurrent(restore) }
            )
            pendingFit = fit
            try {
              await fit.completion
            } finally {
              if (pendingFit === fit) {
                pendingFit = null
              }
            }
            if (isCurrent(restore)) {
              options.onCurrentRestoreSettled()
            }
          }
        }
      )
    } finally {
      if (activeRestore === restore) {
        activeRestore = null
      }
    }
  }

  return {
    apply,
    cancel,
    retargetGeneration: (ptyId, generation) => {
      if (activeRestore?.valid && activeRestore.ptyId === ptyId) {
        activeRestore.generation = generation
      }
    }
  }
}
