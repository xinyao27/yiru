import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import {
  decodeTerminalMultiplexJson,
  encodeTerminalMultiplexJson
} from '@yiru/runtime-protocol/terminal-multiplex/json'

import { MobileTerminalControls } from './controls'
import { MobileTerminalDelivery } from './delivery'
import type {
  MobileMultiplexedTerminal,
  MobileTerminalCallbacks,
  MobileTerminalDeliveryState
} from './types'

type SendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

type MobileTerminalStreamOptions = {
  streamId: number
  terminal: string
  transportGeneration: string
  client: { id: string; type: 'mobile' }
  viewport?: { cols: number; rows: number }
  delivery: MobileTerminalDeliveryState
  callbacks: MobileTerminalCallbacks
  send: SendFrame
  allocateCorrelationId: () => number
  onClose: (streamId: number) => void
}

export class MobileTerminalMultiplexedStream {
  readonly publicStream: MobileMultiplexedTerminal
  private readonly options: MobileTerminalStreamOptions
  private readonly controls: MobileTerminalControls
  private readonly delivery: MobileTerminalDelivery
  private closed = false

  constructor(options: MobileTerminalStreamOptions) {
    this.options = options
    this.delivery = new MobileTerminalDelivery({
      routeId: options.streamId,
      callbacks: options.callbacks,
      send: options.send,
      allocateCorrelationId: options.allocateCorrelationId,
      setCredit: (bytes, reason) => this.controls.publishOutputCredit(bytes, reason),
      getAckEveryBytes: () => this.controls.ackEveryBytes,
      onEnd: () => this.close(false)
    })
    this.controls = new MobileTerminalControls({
      routeId: options.streamId,
      clientId: options.client.id,
      delivery: options.delivery,
      callbacks: options.callbacks,
      send: options.send,
      allocateCorrelationId: options.allocateCorrelationId,
      getParsedSeq: () => this.delivery.parsedSeq,
      beginReveal: () => this.delivery.beginReveal()
    })
    this.publicStream = {
      streamId: options.streamId,
      sendInput: (text) => this.controls.sendInput(text),
      sendInputAccepted: (text) => this.controls.sendInputAccepted(text),
      sendQueryReply: (text) => this.controls.sendQueryReply(text),
      resize: (cols, rows) => this.controls.resize(cols, rows),
      claimViewport: (cols, rows) => this.controls.claimViewport(cols, rows),
      setDeliveryState: (state) => this.controls.setDeliveryState(state),
      outputParsed: (endSeq, receiverQueueBytes) =>
        this.delivery.outputParsed(endSeq, receiverQueueBytes),
      snapshotParsed: (snapshotId) => this.delivery.snapshotParsed(snapshotId),
      close: () => this.close(true)
    }
  }

  subscribe(): boolean {
    return this.options.send(
      TerminalMultiplexOpcode.Subscribe,
      this.options.streamId,
      this.delivery.parsedSeq,
      this.options.allocateCorrelationId(),
      encodeTerminalMultiplexJson({
        terminal: this.options.terminal,
        transportGeneration: this.options.transportGeneration,
        client: this.options.client,
        ...(this.options.viewport ? { viewport: this.options.viewport } : {}),
        lastParsedSeq: this.delivery.parsedSeq.toString(),
        delivery: this.controls.deliveryState,
        snapshotMaxBytes: 2 * 1024 * 1024,
        capabilities: { dualScreenSnapshot: 1, parseAck: 1, explicitWriteAck: 1 }
      })
    )
  }

  resubscribe(): boolean {
    this.delivery.prepareForNewEpoch()
    this.controls.prepareForNewEpoch()
    return this.subscribe()
  }

  handle(frame: TerminalMultiplexFrame): void {
    if (this.closed) {
      return
    }
    if (frame.unsupportedOpcode !== undefined) {
      this.fail('Mobile terminal received an unsupported opcode.')
      return
    }
    if (this.delivery.handle(frame)) {
      return
    }
    switch (frame.opcode) {
      case TerminalMultiplexOpcode.Subscribed:
        this.handleSubscribed(frame)
        return
      case TerminalMultiplexOpcode.Error:
        this.handleError(frame)
        return
      case TerminalMultiplexOpcode.FitOverride:
        this.handleFitOverride(frame)
        return
      case TerminalMultiplexOpcode.Driver:
        this.handleDriver(frame)
        return
      case TerminalMultiplexOpcode.Ack:
        this.controls.handleAck(frame)
        return
      case TerminalMultiplexOpcode.Credit:
        if (!this.controls.handleCredit(frame)) {
          this.fail('Mobile terminal received an invalid credit record.')
        }
        return
      case TerminalMultiplexOpcode.Resized:
        this.handleResized(frame)
        return
      case TerminalMultiplexOpcode.Epoch:
      case TerminalMultiplexOpcode.Heartbeat:
      case TerminalMultiplexOpcode.Subscribe:
      case TerminalMultiplexOpcode.Unsubscribe:
      case TerminalMultiplexOpcode.End:
      case TerminalMultiplexOpcode.Output:
      case TerminalMultiplexOpcode.Input:
      case TerminalMultiplexOpcode.Resize:
      case TerminalMultiplexOpcode.ClaimViewport:
      case TerminalMultiplexOpcode.SnapshotRequest:
      case TerminalMultiplexOpcode.SnapshotStart:
      case TerminalMultiplexOpcode.SnapshotChunk:
      case TerminalMultiplexOpcode.SnapshotEnd:
      case TerminalMultiplexOpcode.VisibilityGate:
      case TerminalMultiplexOpcode.RevealSnapshot:
      case TerminalMultiplexOpcode.SideEffectBatch:
      case TerminalMultiplexOpcode.ClearBuffer:
      case TerminalMultiplexOpcode.ModelRestore:
      case TerminalMultiplexOpcode.Signal:
      case TerminalMultiplexOpcode.Kill:
      case TerminalMultiplexOpcode.Metadata:
        this.fail('Mobile terminal received an unexpected stream opcode.')
    }
  }

  suspendForBackground(): void {
    this.controls.suspendForBackground()
  }

  resumeAfterShortBackground(): void {
    this.controls.resumeAfterShortBackground()
  }

  transportClosed(permanent = false): void {
    if (this.closed) {
      return
    }
    this.delivery.prepareForNewEpoch()
    if (permanent) {
      this.closed = true
      this.options.callbacks.onTransportClose?.()
    }
  }

  private handleSubscribed(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (
      value?.terminal !== this.options.terminal ||
      value.transportGeneration !== this.options.transportGeneration ||
      value.initialState !== 'snapshot' ||
      typeof value.snapshotId !== 'number'
    ) {
      this.fail('Mobile terminal subscription response is invalid.')
      return
    }
    this.delivery.beginInitialSnapshot(value.snapshotId)
  }

  private handleError(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    this.fail(
      typeof value?.message === 'string' ? value.message : 'Mobile terminal protocol error.'
    )
  }

  private handleFitOverride(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (
      value &&
      (value.mode === 'mobile-fit' ||
        value.mode === 'desktop-fit' ||
        value.mode === 'remote-desktop-fit') &&
      typeof value.cols === 'number' &&
      typeof value.rows === 'number'
    ) {
      this.options.callbacks.onFitOverrideChanged?.({
        mode: value.mode,
        cols: value.cols,
        rows: value.rows
      })
    }
  }

  private handleResized(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (value) {
      this.options.callbacks.onMetadata?.({ type: 'resized', ...value })
    }
  }

  private handleDriver(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    const driver = value?.driver
    if (isDriver(driver)) {
      this.options.callbacks.onDriverChanged?.(driver)
    }
  }

  private fail(message: string): void {
    this.options.callbacks.onError?.(message)
    this.close(false)
  }

  private close(sendUnsubscribe: boolean): void {
    if (this.closed) {
      return
    }
    if (sendUnsubscribe) {
      this.controls.close(this.delivery.parsedSeq)
    }
    this.closed = true
    this.options.onClose(this.options.streamId)
  }
}

function isDriver(
  value: unknown
): value is { kind: 'idle' } | { kind: 'desktop' } | { kind: 'mobile'; clientId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'idle' ||
      value.kind === 'desktop' ||
      (value.kind === 'mobile' && 'clientId' in value && typeof value.clientId === 'string'))
  )
}
