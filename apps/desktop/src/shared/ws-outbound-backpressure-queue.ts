// Why: both the server reply path (e2ee-channel) and the client send path
// (remote-runtime-client) write to a ws with no backpressure handling. A fast
// producer over a slow link balloons ws.bufferedAmount / RSS without bound, or
// (binary path) silently drops frames. This queue holds outbound frames in
// order while bufferedAmount is over a soft cap and flushes as it drains, so no
// frame is dropped or reordered. It only signals overflow when a hard byte
// bound is exceeded (the link is effectively dead), letting the caller force a
// clean reconnect/resync instead of growing memory without limit.
//
// Generic over the frame type so it serves both the text reply path (encrypted
// base64 strings) and the binary send path (Uint8Array frames).

export type WsOutboundBackpressureQueueOptions<TFrame> = {
  /** Send a frame on the wire. Called only when under the soft cap. */
  send: (frame: TFrame) => void
  /** Serialized byte length of a frame, for cap accounting. */
  byteLengthOf: (frame: TFrame) => number
  /** Current ws.bufferedAmount in bytes. */
  getBufferedAmount: () => number
  /** True when the socket can still accept sends (OPEN and keyed). */
  isWritable: () => boolean
  /**
   * Called once when queued bytes exceed maxQueuedBytes — the link is wedged.
   * The caller should tear the connection down so a fresh subscription can
   * replay an authoritative snapshot. The queue drops its backlog afterward.
   */
  onOverflow: () => void
  /** Optional hard cap on queued bytes attributed to one caller-defined group. */
  maxQueuedBytesPerGroup?: number
}

export type WsOutboundBackpressureQueue<TFrame> = {
  /** Queue-or-send a frame. Preserves order across all prior frames. */
  enqueue: (frame: TFrame, groupKey?: string) => void
  /** Bytes currently held (not yet handed to the wire). */
  queuedBytes: () => number
  /** Drop the backlog and stop the drain timer (call on close). */
  dispose: () => void
}

const DEFAULT_SOFT_CAP_BYTES = 8 * 1024 * 1024
// Why: tolerate a large transient burst (e.g. a build log spike) before
// declaring the link dead; 64 MiB is ~8x the soft cap yet still bounds RSS.
const DEFAULT_MAX_QUEUED_BYTES = 64 * 1024 * 1024
const DEFAULT_DRAIN_POLL_MS = 25

export function createWsOutboundBackpressureQueue<TFrame>(
  options: WsOutboundBackpressureQueueOptions<TFrame>
): WsOutboundBackpressureQueue<TFrame> {
  const softCapBytes = DEFAULT_SOFT_CAP_BYTES
  const maxQueuedBytes = DEFAULT_MAX_QUEUED_BYTES
  const maxQueuedBytesPerGroup = options.maxQueuedBytesPerGroup

  const bufferedAmount = (): number => options.getBufferedAmount()

  const queue: { frame: TFrame; bytes: number; groupKey?: string }[] = []
  const queuedBytesByGroup = new Map<string, number>()
  let queueHead = 0
  let queued = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let overflowed = false
  let disposed = false

  const stopTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const dropBacklog = (): void => {
    queue.length = 0
    queueHead = 0
    queued = 0
    queuedBytesByGroup.clear()
    stopTimer()
  }

  const adjustGroupBytes = (groupKey: string | undefined, delta: number): number => {
    if (groupKey === undefined) {
      return 0
    }
    const next = (queuedBytesByGroup.get(groupKey) ?? 0) + delta
    if (next === 0) {
      queuedBytesByGroup.delete(groupKey)
    } else {
      queuedBytesByGroup.set(groupKey, next)
    }
    return next
  }

  // Drain as many queued frames as the wire will take without crossing the
  // soft cap; re-arm the poll timer if frames remain.
  const drain = (): void => {
    if (disposed || overflowed) {
      return
    }
    if (!options.isWritable()) {
      // Socket went away mid-park; let the transport's own close path clean up.
      dropBacklog()
      return
    }
    while (queueHead < queue.length && bufferedAmount() <= softCapBytes) {
      const entry = queue[queueHead++]
      queued -= entry.bytes
      adjustGroupBytes(entry.groupKey, -entry.bytes)
      options.send(entry.frame)
    }
    if (queueHead < queue.length) {
      timer = setTimeout(drain, DEFAULT_DRAIN_POLL_MS)
    } else {
      // Why: resetting the drained array keeps enqueue/drain O(1) per frame;
      // repeated Array.shift() would make recovery from a large backlog O(n²).
      queue.length = 0
      queueHead = 0
      stopTimer()
    }
  }

  return {
    enqueue(frame: TFrame, groupKey?: string): void {
      if (disposed || overflowed) {
        return
      }
      // Fast path: nothing parked and the wire is under the cap — send directly.
      if (queueHead === queue.length && options.isWritable() && bufferedAmount() <= softCapBytes) {
        options.send(frame)
        return
      }
      const bytes = options.byteLengthOf(frame)
      queue.push({ frame, bytes, ...(groupKey !== undefined ? { groupKey } : {}) })
      queued += bytes
      const groupQueued = adjustGroupBytes(groupKey, bytes)
      if (
        queued > maxQueuedBytes ||
        (maxQueuedBytesPerGroup !== undefined && groupQueued > maxQueuedBytesPerGroup)
      ) {
        overflowed = true
        dropBacklog()
        options.onOverflow()
        return
      }
      if (timer === null) {
        timer = setTimeout(drain, DEFAULT_DRAIN_POLL_MS)
      }
    },
    queuedBytes: () => queued,
    dispose(): void {
      disposed = true
      dropBacklog()
    }
  }
}
