export type MobileNotificationDispatchEvent = {
  type: 'notification'
  source: 'agent-task-complete' | 'terminal-bell' | 'test'
  title: string
  body: string
  worktreeId?: string
  notificationId?: string
  notificationSeq?: number
}

export type MobileNotificationDismissEvent = {
  type: 'dismiss'
  notificationId: string
  notificationSeq?: number
}

export type MobileNotificationEvent =
  | MobileNotificationDispatchEvent
  | MobileNotificationDismissEvent

export type ReplayableMobileNotification = MobileNotificationEvent & {
  notificationSeq: number
}

const DEFAULT_CAPACITY = 256

// Why: live delivery and reconnect replay must share one sequence owner; split
// ownership can advance one path without advancing the client's watermark.
export class MobileNotificationChannel {
  private sequence = 0
  private readonly replay: ReplayableMobileNotification[] = []
  private readonly listeners = new Set<(event: ReplayableMobileNotification) => void>()

  constructor(private readonly capacity: number = DEFAULT_CAPACITY) {}

  subscribe(listener: (event: ReplayableMobileNotification) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispatch(event: MobileNotificationEvent): void {
    const replayable = { ...event, notificationSeq: ++this.sequence }
    this.replay.push(replayable)
    if (this.replay.length > this.capacity) {
      // Why: reconnect catch-up is bounded like the client's 256 scheduled-notification cap.
      this.replay.splice(0, this.replay.length - this.capacity)
    }
    for (const listener of this.listeners) {
      listener({ ...replayable })
    }
  }

  dismiss(notificationId: string): void {
    this.dispatch({ type: 'dismiss', notificationId })
  }

  getMissedSince(lastSeenSeq: number): ReplayableMobileNotification[] {
    if (lastSeenSeq >= this.sequence) {
      return []
    }
    // Why: detached values keep one subscriber from mutating another client's replay source.
    return this.replay
      .filter((entry) => entry.notificationSeq > lastSeenSeq)
      .map((entry) => ({ ...entry }))
  }
}
