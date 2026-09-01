import type { ManagedPane } from '../pane-manager/pane-manager'
import { flushTerminalOutput } from '../pane-manager/pane-terminal-output-scheduler'
import type { ReplayingPanesRef } from '../replay-guard'
import { replayIntoTerminal, replayIntoTerminalAsync } from '../replay-guard'
import { buildFreshShellViewportBlankingSequence } from '../terminal-restored-viewport'
import type { RestoredViewportBlankingPanesRef } from '../terminal-restored-viewport'

type ReplayWriterOptions = {
  pane: ManagedPane
  replayingPanesRef: ReplayingPanesRef
  restoredViewportBlankingPanesRef?: RestoredViewportBlankingPanesRef
  shouldRefreshViewportSynchronously: () => boolean
}

export type ReplayWriter = {
  write: (data: string) => void
  writeAsync: (data: string) => Promise<void>
  prepareFreshShellViewport: (force: boolean) => void
}

export function createReplayWriter(options: ReplayWriterOptions): ReplayWriter {
  const write = (data: string): void => {
    // Why: drain queued background bytes before replay so an older deferred
    // write cannot land on top of the authoritative paint.
    flushTerminalOutput(options.pane.terminal)
    replayIntoTerminal(options.pane, options.replayingPanesRef, data, {
      shouldRefreshViewportSynchronously: options.shouldRefreshViewportSynchronously
    })
  }

  const writeAsync = (data: string): Promise<void> => {
    // Why: WebGL must rebuild after xterm parses replay bytes, not after they
    // are merely queued.
    flushTerminalOutput(options.pane.terminal)
    return replayIntoTerminalAsync(options.pane, options.replayingPanesRef, data, {
      shouldRefreshViewportSynchronously: options.shouldRefreshViewportSynchronously
    })
  }

  return {
    write,
    writeAsync,
    prepareFreshShellViewport: (force) => {
      const hadRestoredViewport =
        options.restoredViewportBlankingPanesRef?.current.delete(options.pane.id) ?? false
      if (!force && !hadRestoredViewport) {
        return
      }
      // Why: fresh Windows ConPTY output paints at screen coordinates, so
      // restored rows must leave the viewport before the first prompt redraw.
      write(buildFreshShellViewportBlankingSequence(options.pane.terminal.rows))
    }
  }
}
