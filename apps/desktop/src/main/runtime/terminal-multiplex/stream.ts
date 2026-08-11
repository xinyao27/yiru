import {
  decodeTerminalMultiplexVisibilityRecord,
  encodeTerminalMultiplexCreditRecord
} from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import {
  decodeTerminalMultiplexJson,
  encodeTerminalMultiplexJson
} from '@yiru/runtime-protocol/terminal-multiplex/json'

import type { TerminalViewportClient } from '../rpc/methods/terminal-viewport-control'
import { TerminalMultiplexSnapshotCoordinator } from './snapshot-coordinator'
import { admitTerminalMultiplexStream } from './stream-admission'
import { TerminalMultiplexStreamControls } from './stream-controls'
import type { TerminalMultiplexStreamOptions } from './stream-options'
import { TerminalMultiplexStreamOutput } from './stream-output'
import {
  decodeTerminalMultiplexClientAck,
  decodeTerminalMultiplexClientCredit,
  decodeTerminalMultiplexSnapshotRequest,
  type TerminalMultiplexSubscribeRecord
} from './stream-records'
import { TerminalMultiplexStreamSender } from './stream-sender'
import { activateTerminalMultiplexStream } from './stream-subscription'

type StreamState = 'snapshotting' | 'live' | 'gated' | 'recovering' | 'closed'

export class TerminalMultiplexStream {
  private readonly options: TerminalMultiplexStreamOptions
  private readonly sender: TerminalMultiplexStreamSender
  private state: StreamState = 'snapshotting'
  private readonly ptyId: string
  private readonly client: TerminalViewportClient
  private readonly subscriptionKey: string
  private readonly output: TerminalMultiplexStreamOutput
  private readonly controls: TerminalMultiplexStreamControls
  private delivery: TerminalMultiplexSubscribeRecord['delivery']
  private readonly snapshots: TerminalMultiplexSnapshotCoordinator
  private stateVersion = 0
  private unsubscribers: (() => void)[] = []
  private readonly exitAbort = new AbortController()

  private constructor(options: TerminalMultiplexStreamOptions, ptyId: string) {
    this.options = options
    this.sender = new TerminalMultiplexStreamSender(options.routeId, options.send)
    this.ptyId = ptyId
    this.client = {
      id: options.record.client.id,
      type: options.record.client.type === 'mobile' ? 'mobile' : 'desktop'
    }
    this.subscriptionKey = `multiplex:${options.connectionId}:${options.routeId}`
    this.delivery = options.record.delivery
    this.output = new TerminalMultiplexStreamOutput({
      ptyId,
      runtime: options.runtime,
      connectionInFlightBytes: options.connectionInFlightBytes,
      connectionQueueBytes: options.connectionQueueBytes,
      noteConnectionSent: options.noteConnectionSent,
      noteConnectionAck: options.noteConnectionAck,
      sendOutput: (payload, endSeq) =>
        this.sender.send(TerminalMultiplexOpcode.Output, endSeq, 0, payload),
      sendAdaptiveCredit: (windowBytes) =>
        this.sender.send(
          TerminalMultiplexOpcode.Credit,
          0n,
          0,
          encodeTerminalMultiplexCreditRecord({
            direction: 0,
            reason: 1,
            maxInFlightBytes: windowBytes,
            ackEveryBytes: Math.min(256 * 1024, Math.max(16 * 1024, Math.floor(windowBytes / 8))),
            maxFrameBytes: 64 * 1024
          })
        ),
      recover: (reason) => this.snapshots.recover(reason, this.state === 'gated'),
      streamKey: this.subscriptionKey,
      participatesInPressure: () => this.delivery.visible || this.delivery.interested,
      telemetry: options.telemetry
    })
    this.snapshots = new TerminalMultiplexSnapshotCoordinator({
      runtime: options.runtime,
      ptyId,
      maxBytes: options.record.snapshotMaxBytes,
      output: this.output,
      allocateSnapshotId: options.allocateSnapshotId,
      send: (opcode, seq, correlationId, payload) =>
        this.sender.send(opcode, seq, correlationId, payload),
      sendControlAck: (correlationId, result) => this.sender.ack(correlationId, 3, result),
      isDeliveryActive: () => this.delivery.visible || this.delivery.interested,
      onState: (state) => {
        this.state = state
      },
      telemetry: options.telemetry
    })
    this.controls = new TerminalMultiplexStreamControls({
      runtime: options.runtime,
      terminal: options.record.terminal,
      ptyId,
      client: this.client,
      subscriptionKey: this.subscriptionKey,
      transportGeneration: options.record.transportGeneration,
      sendAck: (correlationId, kind, result) => this.sender.ack(correlationId, kind, result),
      sendJson: (opcode, seq, correlationId, value) =>
        this.sender.json(opcode, seq, correlationId, value),
      onNormalBufferResize: () => void this.snapshots.start(6, options.allocateSnapshotId())
    })
  }

  static open(options: TerminalMultiplexStreamOptions): TerminalMultiplexStream | null {
    const admission = admitTerminalMultiplexStream(options.runtime, options.record)
    if (!admission.accepted) {
      options.send(
        TerminalMultiplexOpcode.Error,
        options.routeId,
        0n,
        options.subscribeCorrelationId,
        encodeTerminalMultiplexJson({
          code: admission.code,
          message: admission.message,
          fatal: true,
          retryable: true
        })
      )
      options.telemetry.close()
      return null
    }
    return new TerminalMultiplexStream(options, admission.ptyId)
  }

  async activate(): Promise<boolean> {
    try {
      return await this.start()
    } catch {
      this.sender.error(this.options.subscribeCorrelationId, 'provider_unavailable', true)
      this.dispose()
      return false
    }
  }

  handle(frame: TerminalMultiplexFrame): void {
    if (this.state === 'closed') {
      return
    }
    if (frame.unsupportedOpcode !== undefined) {
      this.sender.error(frame.correlationId, 'unsupported_opcode', true)
      return this.dispose()
    }
    if (frame.opcode === TerminalMultiplexOpcode.Ack) {
      this.handleAck(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Credit) {
      const record = decodeTerminalMultiplexClientCredit(frame)
      if (!record) {
        this.rejectFrame(frame)
        return
      }
      this.output.applyCredit(record)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.VisibilityGate) {
      this.handleVisibility(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.RevealSnapshot) {
      this.handleReveal(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.SnapshotRequest) {
      this.handleSnapshotRequest(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Unsubscribe) {
      if (frame.correlationId === 0 || frame.payload.byteLength !== 0) {
        this.rejectFrame(frame)
        return
      }
      this.sender.ack(frame.correlationId, 3, { status: 0, errorCode: 0, seq: frame.seq })
      this.dispose()
      return
    }
    if (!this.controls.handle(frame)) {
      this.sender.error(frame.correlationId, 'unsupported_opcode', true)
      this.dispose()
    }
  }

  dispose(): void {
    if (this.state === 'closed') {
      return
    }
    this.state = 'closed'
    this.snapshots.dispose()
    this.output.dispose()
    this.exitAbort.abort()
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe())
    if (this.client.type === 'mobile') {
      this.options.runtime.handleMobileUnsubscribe(this.ptyId, this.client.id)
    } else {
      void this.options.runtime.unregisterRemoteDesktopViewer(this.ptyId, this.subscriptionKey)
    }
    this.options.onClose(this.options.routeId)
    this.options.telemetry.close()
  }

  private async start(): Promise<boolean> {
    const activated = await activateTerminalMultiplexStream({
      runtime: this.options.runtime,
      ptyId: this.ptyId,
      client: this.client,
      subscriptionKey: this.subscriptionKey,
      record: this.options.record,
      subscribeCorrelationId: this.options.subscribeCorrelationId,
      output: this.output,
      snapshots: this.snapshots,
      allocateSnapshotId: this.options.allocateSnapshotId,
      registerUnsubscriber: (unsubscribe) => this.unsubscribers.push(unsubscribe),
      send: (opcode, seq, correlationId, payload) =>
        this.sender.send(opcode, seq, correlationId, payload),
      sendJson: (opcode, seq, correlationId, value) =>
        this.sender.json(opcode, seq, correlationId, value),
      finish: (exitCode) => this.finish(exitCode),
      exitSignal: this.exitAbort.signal
    })
    if (!activated) {
      this.sender.error(0, 'transport_generation_claimed', true)
      this.dispose()
      return false
    }
    return true
  }

  private handleAck(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexClientAck(frame)
    if (!record) {
      this.rejectFrame(frame)
      return
    }
    if (record.kind === 0) {
      if (!this.output.acknowledge(record)) {
        this.rejectFrame(frame)
      }
      return
    }
    if (!this.snapshots.acknowledge(frame, record)) {
      this.rejectFrame(frame)
    }
  }

  private handleVisibility(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexVisibilityRecord(frame.payload)
    if (!record || record.stateVersion !== frame.correlationId) {
      this.rejectFrame(frame)
      return
    }
    this.stateVersion = record.stateVersion
    const gated = !record.visible && !record.deliveryInterest
    const wasGated = !this.delivery.visible && !this.delivery.interested
    this.delivery = {
      visible: record.visible,
      interested: record.deliveryInterest,
      priority: record.priority
    }
    this.output.refreshPressure()
    if (gated) {
      this.output.gate(true)
      this.state = 'gated'
    } else if (!wasGated) {
      this.output.gate(false)
    }
    this.sender.ack(frame.correlationId, 3, {
      status: 0,
      errorCode: 0,
      seq: this.options.runtime.getTerminalWireByteSequence(this.ptyId)
    })
  }

  private handleReveal(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (value?.stateVersion !== this.stateVersion || frame.correlationId === 0) {
      this.rejectFrame(frame)
      return
    }
    void this.snapshots.start(3, frame.correlationId)
  }

  private handleSnapshotRequest(frame: TerminalMultiplexFrame): void {
    const request = decodeTerminalMultiplexSnapshotRequest(frame.payload)
    if (!request || frame.correlationId === 0) {
      this.rejectFrame(frame)
      return
    }
    this.snapshots.request(frame.correlationId, request, frame.seq)
  }

  private finish(exitCode: number | null): void {
    this.output.whenDrained(() => {
      this.sender.end(this.options.runtime.getTerminalWireByteSequence(this.ptyId), exitCode)
      this.dispose()
    })
  }

  private rejectFrame(frame: TerminalMultiplexFrame): void {
    this.sender.error(frame.correlationId, 'invalid_payload', true)
    this.dispose()
  }
}
