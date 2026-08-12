import {
  decodeTerminalMultiplexAckRecord,
  decodeTerminalMultiplexCreditRecord,
  encodeTerminalMultiplexCreditRecord,
  encodeTerminalMultiplexInputRecord,
  encodeTerminalMultiplexVisibilityRecord
} from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'

import { splitMobileTerminalInput } from './input-chunks'
import type { MobileTerminalCallbacks, MobileTerminalDeliveryState } from './types'

const MOBILE_WINDOW_MIN_BYTES = 512 * 1024
const MOBILE_WINDOW_INITIAL_BYTES = 1024 * 1024
const MOBILE_WINDOW_MAX_BYTES = 8 * 1024 * 1024

type SendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

type MobileTerminalControlsOptions = {
  routeId: number
  clientId: string
  delivery: MobileTerminalDeliveryState
  callbacks: MobileTerminalCallbacks
  send: SendFrame
  allocateCorrelationId: () => number
  getParsedSeq: () => bigint
  beginReveal: () => void
}

export class MobileTerminalControls {
  private readonly options: MobileTerminalControlsOptions
  private inputSeq = 0n
  private inputAckSeq = 0n
  private inputCreditBytes = 0
  private inputMaxFrameBytes = 64 * 1024
  private desiredDelivery: MobileTerminalDeliveryState
  private outputWindowBytes = MOBILE_WINDOW_INITIAL_BYTES
  private outputAckEveryBytes = ackThreshold(MOBILE_WINDOW_INITIAL_BYTES)
  private pendingRevealVersion: number | null = null
  private readonly pendingInputs = new Map<
    number,
    { resolve: ((accepted: boolean) => void) | null; timer: ReturnType<typeof setTimeout> }
  >()

  constructor(options: MobileTerminalControlsOptions) {
    this.options = options
    this.desiredDelivery = options.delivery
  }

  get ackEveryBytes(): number {
    return this.outputAckEveryBytes
  }

  get deliveryState(): MobileTerminalDeliveryState {
    return this.desiredDelivery
  }

  sendInput(text: string): boolean {
    return this.sendInputFrame(text, 0, null)
  }

  async sendInputAccepted(text: string): Promise<boolean> {
    const chunks = splitMobileTerminalInput(text, this.inputMaxFrameBytes)
    for (const chunk of chunks) {
      const accepted = await new Promise<boolean>((resolve) => {
        if (!this.sendInputFrame(chunk, 0, resolve)) {
          resolve(false)
        }
      })
      if (!accepted) {
        return false
      }
    }
    return true
  }

  sendQueryReply(text: string): boolean {
    return this.sendInputFrame(text, 1, null)
  }

  resize(cols: number, rows: number): boolean {
    return this.sendJson(TerminalMultiplexOpcode.Resize, { cols, rows, reason: 'fit' })
  }

  claimViewport(cols: number, rows: number): boolean {
    return this.sendJson(TerminalMultiplexOpcode.ClaimViewport, {
      action: 'claim',
      cols,
      rows,
      clientId: this.options.clientId
    })
  }

  setDeliveryState(state: MobileTerminalDeliveryState): boolean {
    const revealing =
      !this.desiredDelivery.visible &&
      !this.desiredDelivery.interested &&
      (state.visible || state.interested)
    if (revealing) {
      this.publishOutputCredit(0)
    }
    const stateVersion = this.options.allocateCorrelationId()
    const sent = this.sendVisibility(state, stateVersion)
    if (sent) {
      this.desiredDelivery = state
      this.pendingRevealVersion = revealing ? stateVersion : null
    }
    return sent
  }

  suspendForBackground(): void {
    this.sendVisibility({ visible: false, interested: false, priority: 'parked' })
    this.publishOutputCredit(0)
  }

  resumeAfterShortBackground(): void {
    this.sendVisibility(this.desiredDelivery)
    this.publishOutputCredit(this.outputWindowBytes)
  }

  publishOutputCredit(bytes: number, reason: 0 | 1 | 2 | 3 = 0): boolean {
    const windowBytes = bytes === 0 ? 0 : clampWindow(bytes)
    const ackEveryBytes = ackThreshold(windowBytes || MOBILE_WINDOW_MIN_BYTES)
    const sent = this.options.send(
      TerminalMultiplexOpcode.Credit,
      this.options.routeId,
      0n,
      0,
      encodeTerminalMultiplexCreditRecord({
        direction: 0,
        reason,
        maxInFlightBytes: windowBytes,
        ackEveryBytes,
        maxFrameBytes: 64 * 1024
      })
    )
    if (sent && windowBytes > 0) {
      this.outputWindowBytes = windowBytes
      this.outputAckEveryBytes = ackEveryBytes
    }
    return sent
  }

  handleAck(frame: TerminalMultiplexFrame): void {
    const ack = decodeTerminalMultiplexAckRecord(frame.payload)
    if (!ack || ack.cumulativeSeq !== frame.seq) {
      this.options.callbacks.onError?.('Mobile terminal control acknowledgement is invalid.')
      return
    }
    if (ack.kind === 1) {
      const pending = this.pendingInputs.get(frame.correlationId)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingInputs.delete(frame.correlationId)
        pending.resolve?.(ack.status === 0)
      }
      if (ack.status === 0 && ack.cumulativeSeq > this.inputAckSeq) {
        this.inputAckSeq = ack.cumulativeSeq
      } else if (ack.status !== 0) {
        this.inputSeq = ack.cumulativeSeq
        this.inputAckSeq = ack.cumulativeSeq
        this.options.callbacks.onError?.('Mobile terminal input was rejected.')
      }
      return
    }
    if (ack.status !== 0) {
      this.options.callbacks.onError?.('Mobile terminal control was rejected.')
      return
    }
    if (
      ack.kind === 3 &&
      this.pendingRevealVersion !== null &&
      frame.correlationId === this.pendingRevealVersion
    ) {
      const stateVersion = this.pendingRevealVersion
      this.pendingRevealVersion = null
      this.options.beginReveal()
      this.options.send(
        TerminalMultiplexOpcode.RevealSnapshot,
        this.options.routeId,
        this.options.getParsedSeq(),
        this.options.allocateCorrelationId(),
        encodeTerminalMultiplexJson({ stateVersion })
      )
    }
  }

  handleCredit(frame: TerminalMultiplexFrame): boolean {
    const credit = decodeTerminalMultiplexCreditRecord(frame.payload)
    if (!credit || frame.seq !== 0n || frame.correlationId !== 0) {
      return false
    }
    if (credit.direction === 0) {
      this.publishOutputCredit(credit.maxInFlightBytes, credit.reason)
    } else {
      this.inputCreditBytes = credit.maxInFlightBytes
      this.inputMaxFrameBytes = Math.min(64 * 1024, credit.maxFrameBytes)
    }
    return true
  }

  prepareForNewEpoch(): void {
    this.inputSeq = 0n
    this.inputAckSeq = 0n
    this.inputCreditBytes = 0
    this.pendingRevealVersion = null
    this.clearPendingInputs()
  }

  close(parsedSeq: bigint): void {
    this.clearPendingInputs()
    this.options.send(
      TerminalMultiplexOpcode.Unsubscribe,
      this.options.routeId,
      parsedSeq,
      this.options.allocateCorrelationId(),
      new Uint8Array()
    )
  }

  private sendInputFrame(
    text: string,
    kind: 0 | 1,
    resolve: ((accepted: boolean) => void) | null
  ): boolean {
    const data = new TextEncoder().encode(text)
    const inFlight = this.inputSeq - this.inputAckSeq
    if (
      data.byteLength > this.inputMaxFrameBytes ||
      inFlight + BigInt(data.byteLength) > BigInt(this.inputCreditBytes)
    ) {
      return false
    }
    const nextSeq = this.inputSeq + BigInt(data.byteLength)
    const correlationId = this.options.allocateCorrelationId()
    const sent = this.options.send(
      TerminalMultiplexOpcode.Input,
      this.options.routeId,
      nextSeq,
      correlationId,
      encodeTerminalMultiplexInputRecord({ kind, data })
    )
    if (!sent) {
      return false
    }
    this.inputSeq = nextSeq
    const timer = setTimeout(() => {
      const pending = this.pendingInputs.get(correlationId)
      if (pending) {
        this.pendingInputs.delete(correlationId)
        pending.resolve?.(false)
        this.options.callbacks.onError?.('Mobile terminal input acknowledgement timed out.')
      }
    }, 10_000)
    this.pendingInputs.set(correlationId, { resolve, timer })
    return true
  }

  private sendVisibility(state: MobileTerminalDeliveryState, stateVersion?: number): boolean {
    const version = stateVersion ?? this.options.allocateCorrelationId()
    return this.options.send(
      TerminalMultiplexOpcode.VisibilityGate,
      this.options.routeId,
      this.options.getParsedSeq(),
      version,
      encodeTerminalMultiplexVisibilityRecord({
        visible: state.visible,
        deliveryInterest: state.interested,
        priority: state.priority === 'parked' ? 0 : state.priority === 'visible' ? 1 : 2,
        stateVersion: version
      })
    )
  }

  private sendJson(opcode: TerminalMultiplexOpcodeValue, value: Record<string, unknown>): boolean {
    return this.options.send(
      opcode,
      this.options.routeId,
      this.options.getParsedSeq(),
      this.options.allocateCorrelationId(),
      encodeTerminalMultiplexJson(value)
    )
  }

  private clearPendingInputs(): void {
    for (const pending of this.pendingInputs.values()) {
      clearTimeout(pending.timer)
      pending.resolve?.(false)
    }
    this.pendingInputs.clear()
  }
}

function clampWindow(bytes: number): number {
  return Math.min(MOBILE_WINDOW_MAX_BYTES, Math.max(MOBILE_WINDOW_MIN_BYTES, bytes))
}

function ackThreshold(windowBytes: number): number {
  return Math.min(256 * 1024, Math.max(16 * 1024, Math.floor(windowBytes / 8)))
}
