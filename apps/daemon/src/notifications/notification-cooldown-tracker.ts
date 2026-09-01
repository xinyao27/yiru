const NOTIFICATION_COOLDOWN_MS = 5000
const MAX_RECENT_NOTIFICATION_KEYS = 50

/**
 * Per-dedupe-key burst suppression for notifications.report's job1 (an agent
 * completion and a terminal bell often fire within the same data chunk, so
 * only the first should surface). `rollback` exists because focus-suppression
 * is decided by the shell (job3), after this reservation already ran on the
 * runtime — a focus-suppressed attempt must not consume the cooldown slot a
 * real delivery would need moments later, so the runtime reserves optimistically
 * and rolls back when the shell reports `suppressed-focus`.
 */
export class NotificationCooldownTracker {
  private readonly recentByKey = new Map<string, number>()

  reserve(dedupeKey: string, now: number): boolean {
    const lastSentAt = this.recentByKey.get(dedupeKey) ?? 0
    if (now - lastSentAt < NOTIFICATION_COOLDOWN_MS) {
      return false
    }
    this.recentByKey.delete(dedupeKey)
    this.recentByKey.set(dedupeKey, now)
    this.prune(now)
    return true
  }

  rollback(dedupeKey: string): void {
    this.recentByKey.delete(dedupeKey)
  }

  private prune(now: number): void {
    if (this.recentByKey.size <= MAX_RECENT_NOTIFICATION_KEYS) {
      return
    }
    for (const [key, ts] of this.recentByKey) {
      if (now - ts >= NOTIFICATION_COOLDOWN_MS) {
        this.recentByKey.delete(key)
      }
    }
    while (this.recentByKey.size > MAX_RECENT_NOTIFICATION_KEYS) {
      const oldest = this.recentByKey.keys().next()
      if (oldest.done) {
        break
      }
      this.recentByKey.delete(oldest.value)
    }
  }
}
