import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import { decodeTerminalMultiplexSnapshotEndRecord } from '@yiru/runtime-protocol/terminal-multiplex/snapshot-records'

import {
  once,
  RemoteTerminalDeliveryAcks,
  safeSequenceNumber,
  sendRemoteTerminalDeliveryAck
} from './delivery-ack'
import { applyRemoteTerminalOutputCredit } from './delivery-credit'
import { decodeRemoteTerminalEnd, decodeRemoteTerminalModelRestore } from './delivery-records'
import type { PendingRemoteTerminalOutput, RemoteTerminalDeliveryOptions } from './delivery-types'
import { RemoteTerminalManualSnapshot } from './manual-snapshot'
import { RemoteTerminalOrderedEvents } from './ordered-events'
import { RemoteTerminalSnapshotAssembler, type RemoteTerminalSnapshot } from './snapshot'
import { REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE } from './types'

export class RemoteTerminalDelivery {
  private readonly options: RemoteTerminalDeliveryOptions
  private readonly snapshot = new RemoteTerminalSnapshotAssembler()
  private readonly pendingOutput: PendingRemoteTerminalOutput[] = []
  private readonly orderedEvents: RemoteTerminalOrderedEvents
  private readonly manualSnapshot: RemoteTerminalManualSnapshot
  private readonly acks: RemoteTerminalDeliveryAcks
  private expectedSequence = 0n
  private snapshotting = true
  private recoveryRequested = false
  private initialSnapshotId = 0

  constructor(options: RemoteTerminalDeliveryOptions) {
    this.options = options
    this.orderedEvents = new RemoteTerminalOrderedEvents(options.callbacks)
    this.acks = new RemoteTerminalDeliveryAcks({
      routeId: options.routeId,
      send: options.send,
      onAdvance: (seq) => this.orderedEvents.publishThrough(seq),
      onEnd: () => {
        this.options.callbacks.onEnd?.()
        this.options.onEnd()
      }
    })
    this.manualSnapshot = new RemoteTerminalManualSnapshot({
      routeId: options.routeId,
      allocateCorrelationId: options.allocateCorrelationId,
      send: options.send,
      getParsedSeq: () => this.acks.parsedSeq,
      isSnapshotting: () => this.snapshotting
    })
  }

  get parsedSeq(): bigint {
    return this.acks.parsedSeq
  }

  beginInitialSnapshot(snapshotId: number): void {
    this.initialSnapshotId = snapshotId
    this.snapshotting = true
    this.options.setCredit(0)
  }

  beginReveal(): void {
    this.snapshotting = true
  }

  handle(frame: TerminalMultiplexFrame): boolean {
    if (this.orderedEvents.handle(frame)) {
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Ack && this.manualSnapshot.handleAck(frame)) {
      return true
    }
    if (
      frame.opcode === TerminalMultiplexOpcode.Credit &&
      applyRemoteTerminalOutputCredit(frame, this.options.setCredit)
    ) {
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Output) {
      this.handleOutput(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.SnapshotStart) {
      this.snapshotting = this.snapshot.start(frame)
      this.recoveryRequested = false
      if (!this.snapshotting) {
        this.recover('invalid snapshot start')
      }
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.SnapshotChunk) {
      if (!this.snapshot.chunk(frame)) {
        this.recover('snapshot chunk mismatch')
      }
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.SnapshotEnd) {
      this.handleSnapshotEnd(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.End) {
      this.handleEnd(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.ModelRestore) {
      this.handleModelRestore(frame)
      return true
    }
    return false
  }

  requestSnapshot(scrollbackRows = 0): Promise<RemoteTerminalSnapshot | null> {
    return this.manualSnapshot.request(scrollbackRows)
  }

  prepareForNewEpoch(): void {
    // Why: docs/reference/terminal-multiplex.md OQ-6 always restores a new epoch from an
    // authoritative snapshot; raw bytes from the previous epoch are never resumed.
    this.snapshotting = true
    this.snapshot.clear()
    this.pendingOutput.splice(0)
    this.recoveryRequested = false
    this.acks.resetPending()
    this.orderedEvents.clear()
    this.manualSnapshot.cancel()
  }

  dispose(): void {
    this.acks.dispose()
    this.manualSnapshot.cancel()
  }

  private handleOutput(frame: TerminalMultiplexFrame): void {
    const startSeq = frame.seq - BigInt(frame.payload.byteLength)
    if (startSeq < 0n) {
      this.recover('invalid output sequence')
      return
    }
    const output = { payload: frame.payload, startSeq, endSeq: frame.seq }
    if (this.snapshotting) {
      this.pendingOutput.push(output)
      return
    }
    this.deliverOutput(output)
  }

  private deliverOutput(output: PendingRemoteTerminalOutput): void {
    if (output.endSeq <= this.expectedSequence) {
      return
    }
    let payload = output.payload
    let startSeq = output.startSeq
    if (startSeq < this.expectedSequence) {
      payload = payload.slice(Number(this.expectedSequence - startSeq))
      startSeq = this.expectedSequence
    }
    if (startSeq !== this.expectedSequence) {
      this.recover('output sequence gap')
      return
    }
    let data: string
    try {
      data = new TextDecoder('utf-8', { fatal: true }).decode(payload)
    } catch {
      this.options.callbacks.onError?.('Remote terminal output is not valid UTF-8.')
      return
    }
    this.expectedSequence = output.endSeq
    const onParsed = once(() => this.noteParsed(startSeq, output.endSeq, payload.byteLength))
    this.options.callbacks.onData(
      data,
      {
        seq: safeSequenceNumber(output.endSeq),
        rawLength: data.length,
        wireByteLength: payload.byteLength
      },
      onParsed
    )
  }

  private handleSnapshotEnd(frame: TerminalMultiplexFrame): void {
    const end = decodeTerminalMultiplexSnapshotEndRecord(frame.payload)
    if (!end || end.snapshotId !== frame.correlationId || end.coverageEndSeq !== frame.seq) {
      this.recover('invalid snapshot end')
      return
    }
    if (end.status !== 0) {
      this.snapshot.clear()
      const isManual = this.manualSnapshot.matches(end.snapshotId)
      if (isManual) {
        this.manualSnapshot.complete(null)
        if (end.status !== 3) {
          this.resumeWithoutSnapshot()
        }
      }
      if (end.status === 2) {
        this.options.callbacks.onError?.(REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE)
      } else if (end.status === 1) {
        this.options.callbacks.onError?.('Remote terminal snapshot is unavailable.')
      }
      return
    }
    const result = this.snapshot.end(frame)
    if (!result) {
      this.recover('invalid snapshot')
      return
    }
    if (this.manualSnapshot.matches(result.id)) {
      this.manualSnapshot.complete(result)
      this.ackManualSnapshot(result)
      return
    }
    this.options.callbacks.onSnapshot(
      result.data,
      {
        cols: result.cols,
        rows: result.rows,
        wireByteLength: result.wireByteLength,
        ...(result.pendingEscapeTailAnsi
          ? { pendingEscapeTailAnsi: result.pendingEscapeTailAnsi }
          : {})
      },
      once(() => this.ackSnapshot(result))
    )
  }

  private ackSnapshot(snapshot: RemoteTerminalSnapshot): void {
    this.acks.rebase(snapshot.coverageEndSeq)
    this.expectedSequence = snapshot.coverageEndSeq
    sendRemoteTerminalDeliveryAck(
      this.options.send,
      this.options.routeId,
      2,
      snapshot.id,
      snapshot.coverageEndSeq,
      0
    )
    this.snapshotting = false
    this.options.setCredit(2 * 1024 * 1024)
    for (const output of this.pendingOutput.splice(0)) {
      if (
        output.endSeq > snapshot.pendingDeliveryStartSeq &&
        output.endSeq <= snapshot.coverageEndSeq
      ) {
        continue
      }
      if (output.endSeq <= snapshot.pendingDeliveryStartSeq) {
        this.recover('output predates snapshot delivery window')
        return
      }
      this.deliverOutput(output)
    }
    if (snapshot.id === this.initialSnapshotId) {
      this.options.callbacks.onSubscribed?.()
    }
  }

  private ackManualSnapshot(snapshot: RemoteTerminalSnapshot): void {
    sendRemoteTerminalDeliveryAck(
      this.options.send,
      this.options.routeId,
      2,
      snapshot.id,
      snapshot.coverageEndSeq,
      0
    )
    this.resumeWithoutSnapshot()
  }

  private resumeWithoutSnapshot(): void {
    this.snapshotting = false
    this.options.setCredit(2 * 1024 * 1024)
    for (const output of this.pendingOutput.splice(0)) {
      this.deliverOutput(output)
    }
  }

  private noteParsed(startSeq: bigint, endSeq: bigint, bytes: number): void {
    this.acks.noteParsed(startSeq, endSeq, bytes)
  }

  private recover(_reason: string): void {
    if (this.recoveryRequested) {
      return
    }
    this.recoveryRequested = true
    this.snapshotting = true
    this.snapshot.clear()
    this.options.setCredit(0)
    this.options.send(
      TerminalMultiplexOpcode.SnapshotRequest,
      this.options.routeId,
      this.acks.parsedSeq,
      this.options.allocateCorrelationId(),
      encodeTerminalMultiplexJson({ requestedScrollbackRows: 1_000 })
    )
  }

  private handleEnd(frame: TerminalMultiplexFrame): void {
    if (!decodeRemoteTerminalEnd(frame)) {
      this.options.callbacks.onError?.('Invalid remote terminal end record.')
      return
    }
    this.acks.deferExit(frame.seq)
  }

  private handleModelRestore(frame: TerminalMultiplexFrame): void {
    const value = decodeRemoteTerminalModelRestore(frame)
    if (!value) {
      this.options.callbacks.onError?.('Invalid remote terminal restore record.')
      return
    }
    this.snapshotting = true
    this.recoveryRequested = value.snapshotFollows
    this.snapshot.clear()
    this.options.setCredit(0)
  }
}
