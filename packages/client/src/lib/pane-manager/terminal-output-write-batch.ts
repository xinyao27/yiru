import {
  ALWAYS_REFRESH_FOREGROUND_SYNCHRONOUSLY,
  type ForegroundRefreshSyncResolver,
  type QueuedWrite,
  type QueueEntry,
  type TerminalOutputBeforeWrite,
  type TerminalOutputParsedCallback
} from './terminal-output-model'

export function takeQueuedChunk(entry: QueueEntry, limit: number): QueuedWrite | null {
  let remaining = limit
  let data = ''
  let foreground: boolean | null = null
  let forceForegroundRefresh = false
  let followupForegroundRefresh = false
  let shouldRefreshForegroundSynchronously: ForegroundRefreshSyncResolver | null = null
  let additionalRefreshSyncResolvers: ForegroundRefreshSyncResolver[] | null = null
  let stripTransientCursorShows = false
  let beforeWrite: TerminalOutputBeforeWrite | undefined
  let additionalBeforeWriteCallbacks: TerminalOutputBeforeWrite[] | null = null
  const parsedCallbacks: TerminalOutputParsedCallback[] = []
  const ackCredits: (() => void)[] = []

  while (remaining > 0 && entry.chunkIndex < entry.chunks.length) {
    const chunk = entry.chunks[entry.chunkIndex]
    if (foreground !== null && chunk.foreground !== foreground) {
      break
    }
    foreground ??= chunk.foreground
    forceForegroundRefresh ||= chunk.forceForegroundRefresh
    followupForegroundRefresh ||= chunk.followupForegroundRefresh
    // Why: one drained write can combine chunks from different renderer
    // states or producers; preserve every forced policy and preparation hook.
    if (chunk.forceForegroundRefresh) {
      if (shouldRefreshForegroundSynchronously === null) {
        shouldRefreshForegroundSynchronously = chunk.shouldRefreshForegroundSynchronously
      } else if (
        chunk.shouldRefreshForegroundSynchronously !== shouldRefreshForegroundSynchronously &&
        !additionalRefreshSyncResolvers?.includes(chunk.shouldRefreshForegroundSynchronously)
      ) {
        additionalRefreshSyncResolvers ??= []
        additionalRefreshSyncResolvers.push(chunk.shouldRefreshForegroundSynchronously)
      }
    }
    stripTransientCursorShows ||= chunk.stripTransientCursorShows
    if (!beforeWrite) {
      beforeWrite = chunk.beforeWrite
    } else if (
      chunk.beforeWrite &&
      chunk.beforeWrite !== beforeWrite &&
      !additionalBeforeWriteCallbacks?.includes(chunk.beforeWrite)
    ) {
      additionalBeforeWriteCallbacks ??= []
      additionalBeforeWriteCallbacks.push(chunk.beforeWrite)
    }
    if (chunk.data.length <= remaining) {
      data += chunk.data
      remaining -= chunk.data.length
      entry.queuedChars -= chunk.data.length
      entry.chunkIndex += 1
      if (chunk.onParsed) {
        parsedCallbacks.push(chunk.onParsed)
      }
      if (chunk.ackCredit) {
        ackCredits.push(chunk.ackCredit)
      }
      continue
    }

    data += chunk.data.slice(0, remaining)
    entry.chunks[entry.chunkIndex] = {
      ...chunk,
      data: chunk.data.slice(remaining)
    }
    entry.queuedChars -= remaining
    remaining = 0
  }

  compactConsumedChunks(entry)
  if (entry.queuedChars < 0) {
    entry.queuedChars = 0
  }
  return data
    ? {
        data,
        foreground: foreground === true,
        forceForegroundRefresh,
        followupForegroundRefresh,
        shouldRefreshForegroundSynchronously:
          additionalRefreshSyncResolvers && shouldRefreshForegroundSynchronously
            ? () =>
                shouldRefreshForegroundSynchronously() ||
                additionalRefreshSyncResolvers.some((resolve) => resolve())
            : (shouldRefreshForegroundSynchronously ?? ALWAYS_REFRESH_FOREGROUND_SYNCHRONOUSLY),
        stripTransientCursorShows,
        beforeWrite:
          additionalBeforeWriteCallbacks && beforeWrite
            ? (queuedData) => {
                beforeWrite(queuedData)
                for (const callback of additionalBeforeWriteCallbacks) {
                  callback(queuedData)
                }
              }
            : beforeWrite,
        onParsed:
          parsedCallbacks.length > 0
            ? () => {
                for (const callback of parsedCallbacks) {
                  callback()
                }
              }
            : undefined,
        ackCredits
      }
    : null
}

function compactConsumedChunks(entry: QueueEntry): void {
  if (entry.chunkIndex === 0) {
    return
  }
  if (entry.chunkIndex === entry.chunks.length) {
    entry.chunks.length = 0
    entry.chunkIndex = 0
    return
  }
  if (entry.chunkIndex >= 64) {
    entry.chunks.splice(0, entry.chunkIndex)
    entry.chunkIndex = 0
  }
}

export function enqueueChunk(
  entry: QueueEntry,
  data: string,
  options?: {
    foreground?: boolean
    forceForegroundRefresh?: boolean
    followupForegroundRefresh?: boolean
    shouldRefreshForegroundSynchronously?: ForegroundRefreshSyncResolver
    stripTransientCursorShows?: boolean
    beforeWrite?: TerminalOutputBeforeWrite
    onParsed?: TerminalOutputParsedCallback
    ackCredit?: () => void
  }
): void {
  entry.chunks.push({
    data,
    foreground: options?.foreground === true,
    forceForegroundRefresh: options?.forceForegroundRefresh === true,
    followupForegroundRefresh: options?.followupForegroundRefresh === true,
    shouldRefreshForegroundSynchronously:
      options?.shouldRefreshForegroundSynchronously ?? ALWAYS_REFRESH_FOREGROUND_SYNCHRONOUSLY,
    stripTransientCursorShows: options?.stripTransientCursorShows === true,
    beforeWrite: options?.beforeWrite,
    onParsed: options?.onParsed,
    ackCredit: options?.ackCredit
  })
  entry.queuedChars += data.length
}

// Fires the delivery ACK credits of every not-yet-consumed queued chunk.
// Every discard path MUST call this before clearing/replacing the queue —
// a dropped chunk still counts as consumed for main's in-flight window, or
// the window shrinks permanently and the PTY wedges behind lost credit.
export function fireQueuedAckCredits(entry: QueueEntry): void {
  for (let index = entry.chunkIndex; index < entry.chunks.length; index += 1) {
    entry.chunks[index].ackCredit?.()
  }
}
