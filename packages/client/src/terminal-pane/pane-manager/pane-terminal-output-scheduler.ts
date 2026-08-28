import {
  coalescedQueuedDataNeedsCursorRestore,
  containsDrainableCursorRestore
} from './terminal-output-cursor'
import {
  discardQueuedTerminalOutput,
  flushQueuedTerminalOutput,
  scheduleTerminalOutputDrain
} from './terminal-output-drain'
import {
  clearForegroundCoalesce,
  clearForegroundHoldSafety,
  createQueueEntry,
  queueCapExceeded,
  replaceBacklogWithWarning,
  scheduleForegroundCoalesceRelease,
  scheduleForegroundHoldSafety
} from './terminal-output-entry'
import {
  BACKGROUND_FLUSH_DELAY_MS,
  LARGE_BACKLOG_CHARS,
  LATENCY_SENSITIVE_FOREGROUND_COALESCE_DELAY_MS,
  LATENCY_SENSITIVE_FOREGROUND_HOLD_SAFETY_DELAY_MS,
  PARSE_SETTLE_TIMEOUT_MS,
  SYNC_FOREGROUND_FLUSH_CHARS,
  type QueueEntry,
  type TerminalBacklogRecoveryRequest,
  type TerminalOutputTarget,
  type WriteTerminalOutputOptions
} from './terminal-output-model'
import {
  getTerminalOutputEntry,
  hasTerminalOutputEntry,
  registerTerminalBacklogRecoveryRequest,
  requestRegisteredTerminalBacklogRecovery,
  setTerminalOutputEntry
} from './terminal-output-registry'
import { writeImmediateForegroundTerminalOutput } from './terminal-output-write'
import { enqueueChunk } from './terminal-output-write-batch'
import {
  failTerminalWriteStallWatch,
  isTerminalWritePipelineCertifiedDead,
  recordTerminalParseProgress
} from './terminal-write-pipeline-health'

export { configureTerminalOutputBacklogCap } from './terminal-output-entry'

function enqueueForegroundOutput(
  entry: QueueEntry,
  data: string,
  options: WriteTerminalOutputOptions
): void {
  enqueueChunk(entry, data, {
    foreground: true,
    forceForegroundRefresh: options.forceForegroundRefresh,
    followupForegroundRefresh: options.followupForegroundRefresh,
    shouldRefreshForegroundSynchronously: options.shouldRefreshForegroundSynchronously,
    stripTransientCursorShows: options.stripTransientCursorShows,
    beforeWrite: options.beforeWrite,
    onParsed: options.onParsed,
    ackCredit: options.ackCredit
  })
}

function scheduleEntryDrain(entry: QueueEntry): void {
  if (hasTerminalOutputEntry(entry.terminal)) {
    scheduleTerminalOutputDrain(0)
  }
}

function queueCoalescedForegroundOutput(
  entry: QueueEntry,
  data: string,
  options: WriteTerminalOutputOptions
): void {
  entry.onBackgroundBacklogDropped = options.onBackgroundBacklogDropped
  entry.highPriority = true
  setTerminalOutputEntry(entry)
  enqueueForegroundOutput(entry, data, options)
  if (queueCapExceeded(entry)) {
    replaceBacklogWithWarning(entry, true)
    scheduleTerminalOutputDrain(0)
    return
  }
  if (options.holdForeground) {
    if (options.latencySensitive === true) {
      entry.foregroundHoldSafetyDelayMs = Math.min(
        entry.foregroundHoldSafetyDelayMs,
        LATENCY_SENSITIVE_FOREGROUND_HOLD_SAFETY_DELAY_MS
      )
    }
    entry.foregroundHold = true
    clearForegroundCoalesce(entry)
    scheduleForegroundHoldSafety(entry, () => scheduleEntryDrain(entry))
    return
  }
  if (options.coalesceForeground || entry.foregroundCoalesce) {
    entry.foregroundHold = false
    clearForegroundHoldSafety(entry)
    const shortenForLatency = options.latencySensitive === true
    if (shortenForLatency) {
      entry.foregroundCoalesceDelayMs = Math.min(
        entry.foregroundCoalesceDelayMs,
        LATENCY_SENSITIVE_FOREGROUND_COALESCE_DELAY_MS
      )
    }
    if (
      containsDrainableCursorRestore(data) ||
      (shortenForLatency && !coalescedQueuedDataNeedsCursorRestore(entry))
    ) {
      clearForegroundCoalesce(entry)
      scheduleTerminalOutputDrain(0)
      return
    }
    scheduleForegroundCoalesceRelease(entry, () => scheduleEntryDrain(entry), {
      rescheduleEarlier: shortenForLatency
    })
    return
  }
  entry.foregroundHold = false
  clearForegroundCoalesce(entry)
  clearForegroundHoldSafety(entry)
  scheduleTerminalOutputDrain(0)
}

export function writeTerminalOutput(
  terminal: TerminalOutputTarget,
  data: string,
  options: WriteTerminalOutputOptions
): void {
  if (isTerminalWritePipelineCertifiedDead(terminal) || !data) {
    options.ackCredit?.()
    return
  }

  if (options.foreground) {
    const entry = getTerminalOutputEntry(terminal)
    if (entry?.highPriority || options.coalesceForeground || options.holdForeground) {
      queueCoalescedForegroundOutput(entry ?? createQueueEntry(terminal, options), data, options)
      return
    }
    if (entry && entry.queuedChars > SYNC_FOREGROUND_FLUSH_CHARS) {
      entry.highPriority = true
      enqueueForegroundOutput(entry, data, options)
      if (queueCapExceeded(entry)) {
        replaceBacklogWithWarning(entry, true)
      }
      scheduleTerminalOutputDrain(0)
      return
    }
    if (options.latencySensitive === false) {
      const queued = entry ?? createQueueEntry(terminal, options)
      queued.onBackgroundBacklogDropped = options.onBackgroundBacklogDropped
      queued.highPriority = true
      setTerminalOutputEntry(queued)
      enqueueForegroundOutput(queued, data, options)
      if (queueCapExceeded(queued)) {
        replaceBacklogWithWarning(queued, true)
      }
      scheduleTerminalOutputDrain(0)
      return
    }
    flushQueuedTerminalOutput(terminal)
    writeImmediateForegroundTerminalOutput(terminal, data, options, discardQueuedTerminalOutput)
    return
  }

  const entry = getTerminalOutputEntry(terminal) ?? createQueueEntry(terminal, options)
  if (!hasTerminalOutputEntry(terminal)) {
    entry.highPriority = false
    setTerminalOutputEntry(entry)
  } else {
    entry.onBackgroundBacklogDropped = options.onBackgroundBacklogDropped
  }
  enqueueChunk(entry, data, {
    beforeWrite: options.beforeWrite,
    onParsed: options.onParsed,
    ackCredit: options.ackCredit
  })
  if (queueCapExceeded(entry)) {
    replaceBacklogWithWarning(entry)
  }
  scheduleTerminalOutputDrain(
    entry.highPriority || entry.queuedChars > LARGE_BACKLOG_CHARS ? 0 : BACKGROUND_FLUSH_DELAY_MS
  )
}

export function flushTerminalOutput(
  terminal: TerminalOutputTarget,
  options?: { maxChars?: number }
): void {
  flushQueuedTerminalOutput(terminal, options)
}

export function requestTerminalBacklogRecovery(terminal: TerminalOutputTarget): void {
  requestRegisteredTerminalBacklogRecovery(terminal)
}

export function registerTerminalBacklogRecovery(
  terminal: TerminalOutputTarget,
  requestRecovery: TerminalBacklogRecoveryRequest
): () => void {
  return registerTerminalBacklogRecoveryRequest(terminal, requestRecovery)
}

export function waitForTerminalOutputParsed(terminal: TerminalOutputTarget): Promise<void> {
  flushQueuedTerminalOutput(terminal)
  if (isTerminalWritePipelineCertifiedDead(terminal)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      if (timer !== null) {
        clearTimeout(timer)
      }
      resolve()
    }
    const finishParsed = (): void => {
      recordTerminalParseProgress(terminal)
      finish()
    }
    timer = setTimeout(finish, PARSE_SETTLE_TIMEOUT_MS)
    try {
      terminal.write('', finishParsed)
    } catch {
      failTerminalWriteStallWatch(terminal)
      finish()
    }
  })
}

export function discardTerminalOutput(terminal: TerminalOutputTarget): void {
  discardQueuedTerminalOutput(terminal)
}
