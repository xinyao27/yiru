import { encodeTerminalMultiplexAckRecord } from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'

type SendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

export class TerminalMultiplexStreamSender {
  private readonly routeId: number
  private readonly sendFrame: SendFrame

  constructor(routeId: number, sendFrame: SendFrame) {
    this.routeId = routeId
    this.sendFrame = sendFrame
  }

  send(
    opcode: TerminalMultiplexOpcodeValue,
    seq: bigint,
    correlationId: number,
    payload: Uint8Array<ArrayBufferLike> = new Uint8Array()
  ): boolean {
    return this.sendFrame(opcode, this.routeId, seq, correlationId, payload)
  }

  json(
    opcode: TerminalMultiplexOpcodeValue,
    seq: bigint,
    correlationId: number,
    value: Record<string, unknown>
  ): void {
    this.send(opcode, seq, correlationId, encodeTerminalMultiplexJson(value))
  }

  ack(
    correlationId: number,
    kind: 1 | 2 | 3,
    result: { status: 0 | 1 | 2 | 3; errorCode: number; seq: bigint }
  ): void {
    this.send(
      TerminalMultiplexOpcode.Ack,
      result.seq,
      correlationId,
      encodeTerminalMultiplexAckRecord({
        kind,
        status: result.status,
        errorCode: result.errorCode,
        acknowledgedBytes: 0,
        cumulativeSeq: result.seq,
        receiverQueueBytes: 0
      })
    )
  }

  error(correlationId: number, code: string, fatal: boolean): void {
    this.json(TerminalMultiplexOpcode.Error, 0n, correlationId, {
      code,
      message: code,
      fatal,
      retryable: !fatal
    })
  }

  end(seq: bigint, exitCode: number | null): void {
    this.json(TerminalMultiplexOpcode.End, seq, 0, {
      exitCode,
      reason: 'exit',
      historyKept: true
    })
  }
}
