import {
  FrameDecoder,
  encodeJsonRpcFrame,
  encodeKeepAliveFrame,
  type DecodedFrame,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse
} from './protocol'

export type RelayClientWrite = (data: Buffer) => boolean | void

export type RelayClientSinkOptions = {
  waitWriteDrain?: (callback: () => void) => void
}

type RelayMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

export class RelayClient {
  readonly id: number
  generation = 0
  closed = false

  private readonly decoder: FrameDecoder
  private write: RelayClientWrite
  private waitWriteDrain?: (callback: () => void) => void
  private readonly drainWaiters = new Set<() => void>()
  private bulkChain = Promise.resolve()
  private nextOutgoingSeq = 1
  private highestReceivedSeq = 0
  private readonly onWriteFailure: (client: RelayClient, error: unknown) => void

  constructor(
    id: number,
    write: RelayClientWrite,
    sinkOptions: RelayClientSinkOptions | undefined,
    onFrame: (client: RelayClient, frame: DecodedFrame) => void,
    onWriteFailure: (client: RelayClient, error: unknown) => void
  ) {
    this.id = id
    this.write = write
    this.waitWriteDrain = sinkOptions?.waitWriteDrain
    this.onWriteFailure = onWriteFailure
    this.decoder = new FrameDecoder((frame) => onFrame(this, frame))
  }

  feed(data: Buffer): void {
    this.decoder.feed(data)
  }

  replaceSink(write: RelayClientWrite, sinkOptions?: RelayClientSinkOptions): void {
    this.write = write
    this.waitWriteDrain = sinkOptions?.waitWriteDrain
    this.closed = false
    // Why: the saturated sink no longer exists; stalled bulk sends must retry
    // against the replacement instead of waiting for an obsolete drain event.
    this.flushDrainWaiters()
    this.nextOutgoingSeq = 1
    this.highestReceivedSeq = 0
    this.decoder.reset()
    this.generation += 1
  }

  invalidate(): void {
    this.generation += 1
    this.closed = true
    this.flushDrainWaiters()
  }

  receiveFrame(frame: DecodedFrame): void {
    if (frame.id > this.highestReceivedSeq) {
      this.highestReceivedSeq = frame.id
    }
  }

  send(message: RelayMessage): boolean | void {
    if (this.closed) {
      return
    }
    const frame = encodeJsonRpcFrame(message, this.nextOutgoingSeq++, this.highestReceivedSeq)
    return this.writeEncodedFrame(frame)
  }

  sendKeepAlive(): void {
    if (this.closed) {
      return
    }
    const frame = encodeKeepAliveFrame(this.nextOutgoingSeq++, this.highestReceivedSeq)
    this.writeEncodedFrame(frame)
  }

  enqueueBulk(message: JsonRpcNotification, isDisposed: () => boolean): Promise<void> {
    if (this.closed || isDisposed()) {
      return Promise.resolve()
    }
    // Why: encode inside the chain so sequence numbers follow actual write order.
    const step = this.bulkChain.then(() => {
      if (this.closed || isDisposed()) {
        return
      }
      if (this.send(message) === false) {
        return this.waitForDrain(isDisposed)
      }
      return undefined
    })
    this.bulkChain = step.catch(() => {})
    return step
  }

  flushDrainWaiters(): void {
    for (const waiter of Array.from(this.drainWaiters)) {
      waiter()
    }
  }

  private waitForDrain(isDisposed: () => boolean): Promise<void> {
    const waitWriteDrain = this.waitWriteDrain
    if (this.closed || isDisposed() || !waitWriteDrain) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) {
          return
        }
        settled = true
        this.drainWaiters.delete(finish)
        resolve()
      }
      this.drainWaiters.add(finish)
      try {
        waitWriteDrain(finish)
      } catch {
        finish()
      }
    })
  }

  private writeEncodedFrame(frame: Buffer): boolean | void {
    try {
      return this.write(frame)
    } catch (error) {
      this.invalidate()
      this.onWriteFailure(this, error)
    }
  }
}
