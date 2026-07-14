import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import { SpoolPairedRuntimeTerminalEventSchema } from '../../shared/spool/spool-paired-runtime-result-contract'
import type { SpoolHostSubscription } from './spool-execution-gateway'

type PairedRuntimeTerminalSubscriptionOptions = {
  instanceId: string
  emit: (event: unknown) => void
  signal: AbortSignal
  onClosed: () => void
}

/** Owns one forwarded terminal stream and never projects downstream transport errors. */
export class PairedRuntimeTerminalSubscription implements SpoolHostSubscription {
  readonly instanceId: string
  private downstream: RemoteRuntimeSubscription | null = null
  private closed = false
  private emittedClosed = false

  constructor(private readonly options: PairedRuntimeTerminalSubscriptionOptions) {
    this.instanceId = options.instanceId
    options.signal.addEventListener('abort', this.close, { once: true })
  }

  attach(downstream: RemoteRuntimeSubscription): void {
    if (this.closed) {
      downstream.close()
      return
    }
    this.downstream = downstream
  }

  handleEvent(
    event:
      | { type: 'response'; response: { ok: boolean; result?: unknown } }
      | { type: 'binary'; bytes: Uint8Array<ArrayBufferLike> }
      | { type: 'error'; code: string; message: string }
      | { type: 'close' }
  ): void {
    if (this.closed || event.type !== 'response' || !event.response.ok) {
      if (event.type !== 'binary') {
        this.handleTransportClose()
      }
      return
    }
    const parsed = SpoolPairedRuntimeTerminalEventSchema.safeParse(event.response.result)
    if (!parsed.success) {
      this.handleTransportClose()
      return
    }
    try {
      this.options.emit(parsed.data)
    } catch {
      this.close()
      return
    }
    if (parsed.data.kind === 'closed') {
      this.emittedClosed = true
      this.close()
    }
  }

  handleTransportClose(): void {
    if (!this.emittedClosed && !this.closed) {
      this.emittedClosed = true
      try {
        this.options.emit({ kind: 'closed' })
      } catch {
        // The upstream subscription is already unusable; cleanup still must run.
      }
    }
    this.close()
  }

  close = (): void => {
    if (this.closed) {
      return
    }
    this.closed = true
    this.options.signal.removeEventListener('abort', this.close)
    this.downstream?.close()
    this.downstream = null
    this.options.onClosed()
  }
}
