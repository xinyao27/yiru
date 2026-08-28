import { EventPublisher } from '@orpc/server'
import type {
  SequencedShellEvent,
  ShellEvent,
  ShellSubscriptionEvent
} from '@yiru/runtime-protocol/contract'

const SHELL_EVENT_REPLAY_CAPACITY = 256

type ShellEventChannels = { published: SequencedShellEvent }

export class BunShellEventChannel {
  private readonly history: SequencedShellEvent[] = []
  private readonly publisher = new EventPublisher<ShellEventChannels>({ maxBufferedEvents: 1 })
  private activeSubscribers = 0
  private sequence = 0

  hasSubscribers(): boolean {
    return this.activeSubscribers > 0
  }

  publish(event: ShellEvent): SequencedShellEvent {
    const sequenced = { ...event, seq: ++this.sequence }
    this.history.push(sequenced)
    if (this.history.length > SHELL_EVENT_REPLAY_CAPACITY) {
      this.history.splice(0, this.history.length - SHELL_EVENT_REPLAY_CAPACITY)
    }
    this.publisher.publish('published', sequenced)
    return sequenced
  }

  async *subscribe(
    lastSeenSeq: number | undefined,
    signal?: AbortSignal
  ): AsyncGenerator<ShellSubscriptionEvent> {
    this.activeSubscribers++
    const iterator = signal
      ? this.publisher.subscribe('published', { maxBufferedEvents: 1, signal })
      : this.publisher.subscribe('published', { maxBufferedEvents: 1 })
    let cursor = lastSeenSeq ?? this.sequence
    try {
      if (lastSeenSeq === undefined) {
        yield { seq: cursor, type: 'ready' }
      } else if (this.requiresResync(cursor)) {
        cursor = this.sequence
        yield { seq: cursor, type: 'resync' }
      } else {
        yield { seq: cursor, type: 'ready' }
      }

      while (!signal?.aborted) {
        const missed = this.missedSince(cursor)
        if (missed === null) {
          cursor = this.sequence
          yield { seq: cursor, type: 'resync' }
          continue
        }
        for (const event of missed) {
          cursor = event.seq
          yield event
        }
        if (missed.length === SHELL_EVENT_REPLAY_CAPACITY) {
          continue
        }
        const next = await iterator.next()
        if (next.done) {
          return
        }
      }
    } finally {
      this.activeSubscribers--
      await iterator.return(undefined)
    }
  }

  private missedSince(lastSeenSeq: number): SequencedShellEvent[] | null {
    if (this.requiresResync(lastSeenSeq)) {
      return null
    }
    return this.history.filter((event) => event.seq > lastSeenSeq)
  }

  private requiresResync(lastSeenSeq: number): boolean {
    if (lastSeenSeq > this.sequence) {
      return true
    }
    const oldestSequence = this.history[0]?.seq
    return oldestSequence !== undefined && lastSeenSeq < oldestSequence - 1
  }
}
