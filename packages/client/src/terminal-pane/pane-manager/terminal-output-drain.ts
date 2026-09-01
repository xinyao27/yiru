import {
  clearForegroundCoalesce,
  clearForegroundHoldSafety,
  discardDetachedQueueEntry,
  hasQueuedChunks,
  isEntryDrainable
} from './terminal-output-entry'
import {
  BACKGROUND_DRAIN_INTERVAL_MS,
  DRAIN_TIME_BUDGET_MS,
  HIGH_PRIORITY_DRAIN_INTERVAL_MS,
  HIGH_PRIORITY_MAX_WRITES_PER_DRAIN,
  LARGE_BACKLOG_CHARS,
  MAX_WRITES_PER_DRAIN,
  type QueueEntry,
  type TerminalOutputTarget
} from './terminal-output-model'
import {
  deleteTerminalOutputEntry,
  getTerminalOutputEntry,
  requestRegisteredTerminalBacklogRecovery,
  setTerminalOutputEntry,
  terminalOutputEntries,
  terminalOutputEntryCount
} from './terminal-output-registry'
import { discardTerminalWritePipeline, writeQueuedTerminalChunk } from './terminal-output-write'
import { fireQueuedAckCredits } from './terminal-output-write-batch'
import { isTerminalWritePipelineCertifiedDead } from './terminal-write-pipeline-health'

let drainTimer: ReturnType<typeof setTimeout> | null = null
let drainTimerDelayMs: number | null = null
let drainImmediatePending = false
const useMessageChannelDrain = typeof MessageChannel !== 'undefined'
let drainChannel: MessageChannel | null = null

function getDrainChannel(): MessageChannel {
  if (drainChannel === null) {
    drainChannel = new MessageChannel()
    drainChannel.port1.onmessage = () => {
      if (!drainImmediatePending) {
        return
      }
      drainImmediatePending = false
      drainQueuedOutput()
    }
  }
  return drainChannel
}

export function scheduleTerminalOutputDrain(delayMs: number): void {
  if (drainImmediatePending) {
    return
  }
  if (drainTimer !== null) {
    if (drainTimerDelayMs !== null && drainTimerDelayMs <= delayMs) {
      return
    }
    clearTimeout(drainTimer)
    drainTimer = null
    drainTimerDelayMs = null
  }
  if (terminalOutputEntryCount() === 0) {
    return
  }
  if (delayMs === 0 && useMessageChannelDrain) {
    drainImmediatePending = true
    getDrainChannel().port2.postMessage(null)
    return
  }
  drainTimer = setTimeout(drainQueuedOutput, delayMs)
  drainTimerDelayMs = delayMs
}

function hasHighPriorityBacklog(): boolean {
  for (const entry of terminalOutputEntries()) {
    if (
      isEntryDrainable(entry) &&
      (entry.highPriority || entry.queuedChars > LARGE_BACKLOG_CHARS)
    ) {
      return true
    }
  }
  return false
}

function hasDrainableBacklog(): boolean {
  for (const entry of terminalOutputEntries()) {
    if (isEntryDrainable(entry)) {
      return true
    }
  }
  return false
}

function takeNextDrainableEntry(): QueueEntry | null {
  let largeBacklogEntry: QueueEntry | null = null
  for (const entry of terminalOutputEntries()) {
    if (!isEntryDrainable(entry)) {
      continue
    }
    if (entry.highPriority) {
      deleteTerminalOutputEntry(entry.terminal)
      return entry
    }
    if (!largeBacklogEntry && entry.queuedChars > LARGE_BACKLOG_CHARS) {
      largeBacklogEntry = entry
    }
  }
  if (largeBacklogEntry) {
    deleteTerminalOutputEntry(largeBacklogEntry.terminal)
    return largeBacklogEntry
  }
  for (const entry of terminalOutputEntries()) {
    if (isEntryDrainable(entry)) {
      deleteTerminalOutputEntry(entry.terminal)
      return entry
    }
  }
  return null
}

function makeParseClockPacer(): () => void {
  return () => {
    try {
      if (terminalOutputEntryCount() > 0 && hasHighPriorityBacklog()) {
        scheduleTerminalOutputDrain(0)
      }
    } catch {
      // Why: this runs inside xterm's write callback; it must never escape.
    }
  }
}

function getDrainNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function drainQueuedOutput(): void {
  drainTimer = null
  drainTimerDelayMs = null
  let writes = 0
  const startedAt = getDrainNow()
  const maxWrites = hasHighPriorityBacklog()
    ? HIGH_PRIORITY_MAX_WRITES_PER_DRAIN
    : MAX_WRITES_PER_DRAIN

  while (terminalOutputEntryCount() > 0 && writes < maxWrites) {
    const entry = takeNextDrainableEntry()
    if (!entry) {
      break
    }
    const writeKind = writeQueuedTerminalChunk(
      entry,
      entry.highPriority ? makeParseClockPacer() : undefined,
      discardQueuedTerminalOutput
    )
    if (writeKind) {
      writes += 1
    }
    if (hasQueuedChunks(entry)) {
      setTerminalOutputEntry(entry)
    } else {
      entry.highPriority = false
      clearForegroundCoalesce(entry)
      clearForegroundHoldSafety(entry)
    }
    if (writes > 0 && getDrainNow() - startedAt >= DRAIN_TIME_BUDGET_MS) {
      break
    }
  }

  if (terminalOutputEntryCount() > 0 && hasDrainableBacklog()) {
    scheduleTerminalOutputDrain(
      hasHighPriorityBacklog()
        ? useMessageChannelDrain
          ? 0
          : HIGH_PRIORITY_DRAIN_INTERVAL_MS
        : BACKGROUND_DRAIN_INTERVAL_MS
    )
  }
}

export function flushQueuedTerminalOutput(
  terminal: TerminalOutputTarget,
  options?: { maxChars?: number }
): void {
  const entry = getTerminalOutputEntry(terminal)
  if (!entry) {
    return
  }
  deleteTerminalOutputEntry(terminal)
  if (isTerminalWritePipelineCertifiedDead(terminal)) {
    discardDetachedQueueEntry(entry)
    discardQueuedTerminalOutput(terminal)
    return
  }
  if (!isEntryDrainable(entry)) {
    setTerminalOutputEntry(entry)
    return
  }
  if (entry.backgroundBacklogDropped && requestRegisteredTerminalBacklogRecovery(terminal)) {
    discardDetachedQueueEntry(entry)
    return
  }

  let flushedChars = 0
  while (hasQueuedChunks(entry)) {
    const queuedCharsBeforeWrite = entry.queuedChars
    const writeKind = writeQueuedTerminalChunk(entry, undefined, discardQueuedTerminalOutput)
    flushedChars += Math.max(0, queuedCharsBeforeWrite - entry.queuedChars)
    if (!writeKind) {
      break
    }
    if (options?.maxChars !== undefined && flushedChars >= options.maxChars) {
      break
    }
  }
  if (hasQueuedChunks(entry)) {
    entry.highPriority = true
    setTerminalOutputEntry(entry)
    scheduleTerminalOutputDrain(0)
  } else {
    entry.highPriority = false
    clearForegroundCoalesce(entry)
    clearForegroundHoldSafety(entry)
  }
}

export function discardQueuedTerminalOutput(terminal: TerminalOutputTarget): void {
  const entry = getTerminalOutputEntry(terminal)
  if (entry) {
    fireQueuedAckCredits(entry)
  }
  deleteTerminalOutputEntry(terminal)
  discardTerminalWritePipeline(terminal)
}
