import {
  discardForegroundRenderSettle,
  writeForegroundTerminalChunk
} from './pane-terminal-foreground-render-settle'
import {
  discardInFlightTerminalOutputAckCredits,
  registerTerminalOutputAckCredits
} from './pane-terminal-output-ack-credit'
import { removeTransientCursorShowSequences } from './terminal-output-cursor'
import {
  clearForegroundCoalesce,
  clearForegroundHoldSafety,
  discardDetachedQueueEntry
} from './terminal-output-entry'
import {
  ALWAYS_REFRESH_FOREGROUND_SYNCHRONOUSLY,
  BACKGROUND_CHUNK_CHARS,
  type QueueEntry,
  type TerminalOutputParsedCallback,
  type TerminalOutputTarget,
  type WriteTerminalOutputOptions
} from './terminal-output-model'
import { fireQueuedAckCredits, takeQueuedChunk } from './terminal-output-write-batch'
import {
  armTerminalWriteStallWatch,
  cancelTerminalWriteStallWatch,
  failTerminalWriteStallWatch,
  isTerminalWritePipelineCertifiedDead,
  settleTerminalWriteStallWatch
} from './terminal-write-pipeline-health'
import { runGuardedWriteCompletionStep } from './xterm-write-callback-guard'

function writeBackgroundTerminalChunk(
  terminal: TerminalOutputTarget,
  data: string,
  onParsed?: TerminalOutputParsedCallback,
  onWriteFailure?: () => void
): boolean {
  const runOnParsed = onParsed
    ? (): void => runGuardedWriteCompletionStep('background-on-parsed', onParsed)
    : undefined
  const runOnWriteFailure = onWriteFailure
    ? (): void => runGuardedWriteCompletionStep('background-on-write-failure', onWriteFailure)
    : undefined
  try {
    if (!runOnParsed || terminal.write.length < 2) {
      terminal.write(data)
      runOnParsed?.()
      return true
    }
    terminal.write(data, runOnParsed)
    return true
  } catch {
    runOnWriteFailure?.()
    return false
  }
}

function composeParsedCallback(
  terminal: TerminalOutputTarget,
  onParsed: TerminalOutputParsedCallback | undefined,
  ackCreditsParsed: (() => void) | undefined,
  pacer: (() => void) | undefined
): TerminalOutputParsedCallback {
  return () => {
    try {
      onParsed?.()
    } finally {
      ackCreditsParsed?.()
      pacer?.()
      settleTerminalWriteStallWatch(terminal)
    }
  }
}

function composeWriteFailureCallback(
  terminal: TerminalOutputTarget,
  ackCreditsParsed: (() => void) | undefined
): () => void {
  return () => {
    try {
      ackCreditsParsed?.()
    } finally {
      failTerminalWriteStallWatch(terminal)
    }
  }
}

export function writeQueuedTerminalChunk(
  entry: QueueEntry,
  pacer: (() => void) | undefined,
  discardTerminalOutput: (terminal: TerminalOutputTarget) => void
): 'foreground' | 'background' | null {
  if (isTerminalWritePipelineCertifiedDead(entry.terminal)) {
    discardDetachedQueueEntry(entry)
    discardTerminalOutput(entry.terminal)
    return null
  }
  const queuedWrite = takeQueuedChunk(entry, BACKGROUND_CHUNK_CHARS)
  if (!queuedWrite) {
    return null
  }
  const ackCreditsParsed = registerTerminalOutputAckCredits(entry.terminal, queuedWrite.ackCredits)
  armTerminalWriteStallWatch(entry.terminal, {
    onCertifiedDead: () => discardTerminalOutput(entry.terminal)
  })
  try {
    queuedWrite.beforeWrite?.(queuedWrite.data)
    const writeAccepted = queuedWrite.foreground
      ? writeForegroundTerminalChunk(
          entry.terminal,
          queuedWrite.stripTransientCursorShows
            ? removeTransientCursorShowSequences(queuedWrite.data)
            : queuedWrite.data,
          {
            forceViewportRefresh: queuedWrite.forceForegroundRefresh,
            followupViewportRefresh: queuedWrite.followupForegroundRefresh,
            shouldRefreshViewportSynchronously: queuedWrite.shouldRefreshForegroundSynchronously,
            onParsed: composeParsedCallback(
              entry.terminal,
              queuedWrite.onParsed,
              ackCreditsParsed,
              pacer
            ),
            onWriteFailure: composeWriteFailureCallback(entry.terminal, ackCreditsParsed)
          }
        )
      : writeBackgroundTerminalChunk(
          entry.terminal,
          queuedWrite.data,
          composeParsedCallback(entry.terminal, queuedWrite.onParsed, ackCreditsParsed, pacer),
          composeWriteFailureCallback(entry.terminal, ackCreditsParsed)
        )
    if (!writeAccepted) {
      fireQueuedAckCredits(entry)
      entry.chunks.length = 0
      entry.chunkIndex = 0
      entry.queuedChars = 0
      clearForegroundHoldSafety(entry)
      clearForegroundCoalesce(entry)
      return null
    }
  } catch {
    cancelTerminalWriteStallWatch(entry.terminal)
    ackCreditsParsed?.()
    fireQueuedAckCredits(entry)
    entry.chunks.length = 0
    entry.chunkIndex = 0
    entry.queuedChars = 0
    clearForegroundHoldSafety(entry)
    clearForegroundCoalesce(entry)
    return null
  }
  return queuedWrite.foreground ? 'foreground' : 'background'
}

export function writeImmediateForegroundTerminalOutput(
  terminal: TerminalOutputTarget,
  data: string,
  options: WriteTerminalOutputOptions,
  discardTerminalOutput: (terminal: TerminalOutputTarget) => void
): void {
  const ackCreditsParsed = registerTerminalOutputAckCredits(
    terminal,
    options.ackCredit ? [options.ackCredit] : []
  )
  armTerminalWriteStallWatch(terminal, {
    onCertifiedDead: () => discardTerminalOutput(terminal)
  })
  try {
    options.beforeWrite?.(data)
    writeForegroundTerminalChunk(
      terminal,
      options.stripTransientCursorShows ? removeTransientCursorShowSequences(data) : data,
      {
        forceViewportRefresh: options.forceForegroundRefresh === true,
        followupViewportRefresh: options.followupForegroundRefresh === true,
        shouldRefreshViewportSynchronously:
          options.shouldRefreshForegroundSynchronously ?? ALWAYS_REFRESH_FOREGROUND_SYNCHRONOUSLY,
        onParsed: composeParsedCallback(terminal, options.onParsed, ackCreditsParsed, undefined),
        onWriteFailure: composeWriteFailureCallback(terminal, ackCreditsParsed)
      }
    )
  } catch (error) {
    ackCreditsParsed?.()
    cancelTerminalWriteStallWatch(terminal)
    throw error
  }
}

export function discardTerminalWritePipeline(terminal: TerminalOutputTarget): void {
  discardInFlightTerminalOutputAckCredits(terminal)
  discardForegroundRenderSettle(terminal)
  cancelTerminalWriteStallWatch(terminal)
}
