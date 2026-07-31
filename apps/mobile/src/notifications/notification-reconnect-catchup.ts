import AsyncStorage from '@react-native-async-storage/async-storage'

// Why: the reconnect catch-up watermark + dedup helpers for #8129, extracted
// from mobile-notifications.ts so that file stays under its max-lines budget.
// The highest desktop notification seq this device has delivered is persisted
// per-host so it survives app restarts. On reconnect we send it to
// notifications.getMissedSince as the catch-up watermark — the desktop then
// returns only notifications dispatched after it, so we never re-push a
// notification we already delivered. The in-memory seen-set is a second guard
// against double-delivery for events that arrive on both the live stream and a
// replay (e.g. a brief liveness spell before a reap).
const LAST_SEQ_STORAGE_KEY_PREFIX = 'yiru:mobileNotificationsLastSeq:'

function lastSeqStorageKey(hostId: string): string {
  return LAST_SEQ_STORAGE_KEY_PREFIX + encodeURIComponent(hostId)
}

export async function loadLastSeenSeq(hostId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(lastSeqStorageKey(hostId))
    const parsed = raw == null ? 0 : Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

export async function saveLastSeenSeq(hostId: string, seq: number): Promise<void> {
  if (!Number.isFinite(seq) || seq <= 0) {
    return
  }
  try {
    await AsyncStorage.setItem(lastSeqStorageKey(hostId), String(seq))
  } catch {
    // Why: persisting the watermark is best-effort. If it fails (or lags), the
    // stored value stays BELOW what we delivered, so a later cold start can
    // re-fetch — and, once the in-memory seen-set is gone, re-show — an already
    // delivered notification. That's the accepted at-least-once trade-off;
    // within a live session the in-memory watermark is authoritative, so only
    // post-restart reconnects are affected.
  }
}

export type CatchUpWatermark = {
  // Records a delivered event's seq (live or replay) and persists the advance.
  observeDelivered: (seq: number | undefined) => void
  value: () => number
  // Reports a stream `ready`; readyCount is 1 for the cold-open stream.
  notifyReady: (readyCount: number) => void
}

// Why: the persisted watermark loads asynchronously while `ready` can arrive at
// any moment, and two catch-up cases were silently dropped — a ready that beat
// the load never retried, and the first ready after a cold start never fetched
// at all even though the watermark exists precisely to resume from it. This gate
// owns that race so callers only report readiness.
export function createCatchUpWatermark(hostId: string, runCatchUp: () => void): CatchUpWatermark {
  let delivered = 0
  let loaded = false
  let pendingReadyCount = 0

  function maybeRun(readyCount: number): void {
    if (!loaded) {
      pendingReadyCount = readyCount
      return
    }
    pendingReadyCount = 0
    // Why: without a persisted watermark (seq 0) there is no cut to fetch from,
    // so a cold-open ready still skips catch-up and starts from the live stream.
    if (readyCount > 1 || delivered > 0) {
      runCatchUp()
    }
  }

  void loadLastSeenSeq(hostId).then((seq) => {
    delivered = Math.max(delivered, seq)
    loaded = true
    if (pendingReadyCount > 0) {
      maybeRun(pendingReadyCount)
    }
  })

  return {
    observeDelivered(seq: number | undefined): void {
      if (seq != null && seq > delivered) {
        delivered = seq
        void saveLastSeenSeq(hostId, delivered)
      }
    },
    value(): number {
      return delivered
    },
    notifyReady: maybeRun
  }
}

// Why: bounded in-memory dedup window for notificationIds/dismiss ids observed
// on the current connection. The desktop already dedupes by seq on replay, but
// a socket that flickers background→foreground→background can deliver an event
// on the live stream and again in a replay; the seen-set guarantees each
// notificationId maps to at most one local push for the connection lifetime.
// Bounded so a long-lived session can't grow without limit — a 2x superset of
// the desktop's 256-entry replay buffer and the 256 scheduled-notification cap.
const RECENTLY_SEEN_CAP = 512

export function createSeenNotificationGuard(): {
  has: (id: string) => boolean
  add: (id: string) => void
} {
  const seen = new Set<string>()
  return {
    has(id: string): boolean {
      return seen.has(id)
    },
    add(id: string): void {
      seen.add(id)
      if (seen.size > RECENTLY_SEEN_CAP) {
        // Why: insertion order; the oldest entries are first. Drop one to stay
        // bounded without disturbing the more-recently-relevant keys.
        const first = seen.values().next().value
        if (first !== undefined) {
          seen.delete(first)
        }
      }
    }
  }
}

// Why: key for the replay dedup guard. Uses notificationId when present, but
// disambiguates by seq so a legitimate live re-delivery of the same id at a
// NEW seq (content refresh, allowed by the existing behaviour) is NOT treated
// as a duplicate, while a replay re-returning the SAME id+seq already delivered
// live is suppressed. Replay events always carry a seq (the desktop assigns
// one), so the guard is effective on the reconnect path.
export function seenKeyForEvent(event: {
  notificationId?: string
  notificationSeq?: number
}): string | null {
  const id = event.notificationId
  if (id != null && event.notificationSeq != null) {
    return `id:${id}#${event.notificationSeq}`
  }
  if (id != null) {
    return `id:${id}`
  }
  if (event.notificationSeq != null) {
    return `seq:${event.notificationSeq}`
  }
  return null
}
