import {
  encodeTerminalMultiplexFrame,
  type TerminalMultiplexOpcode
} from '@yiru/runtime-protocol/terminal-multiplex/frame'

import type { TerminalMultiplexTelemetry } from './telemetry'

type SendBinary = (bytes: Uint8Array<ArrayBufferLike>) => boolean | void

export class TerminalMultiplexSessionSender {
  private readonly sendBinary: SendBinary | undefined
  private readonly epoch: bigint
  private readonly telemetry: TerminalMultiplexTelemetry
  private closed = false

  constructor(
    sendBinary: SendBinary | undefined,
    epoch: bigint,
    telemetry: TerminalMultiplexTelemetry
  ) {
    this.sendBinary = sendBinary
    this.epoch = epoch
    this.telemetry = telemetry
  }

  send(
    opcode: TerminalMultiplexOpcode,
    routeId: number,
    seq: bigint,
    correlationId: number,
    payload: Uint8Array<ArrayBufferLike> = new Uint8Array()
  ): boolean {
    if (this.closed || !this.sendBinary) {
      return false
    }
    const bytes = encodeTerminalMultiplexFrame({
      opcode,
      routeId,
      epoch: this.epoch,
      seq,
      correlationId,
      payload
    })
    const sent = this.sendBinary(bytes) !== false
    if (sent) {
      this.telemetry.noteFrame('sent', opcode, bytes.byteLength)
    }
    return sent
  }

  close(): void {
    this.closed = true
  }
}
