import { TerminalMultiplexErrorCode } from '@yiru/runtime-protocol/terminal-multiplex/error-codes'
import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'

export type TerminalMultiplexAckResult = {
  status: 0 | 1 | 2 | 3
  errorCode: number
  seq: bigint
}

type CompletedControl = {
  opcode: TerminalMultiplexFrame['opcode']
  kind: 1 | 3
  result: TerminalMultiplexAckResult
}

export class TerminalMultiplexControlReplies {
  private readonly completed = new Map<number, CompletedControl>()
  private readonly sendAck: (
    correlationId: number,
    kind: 1 | 3,
    result: TerminalMultiplexAckResult
  ) => void

  constructor(
    sendAck: (correlationId: number, kind: 1 | 3, result: TerminalMultiplexAckResult) => void
  ) {
    this.sendAck = sendAck
  }

  replay(frame: TerminalMultiplexFrame): boolean {
    const completed = this.completed.get(frame.correlationId)
    if (frame.correlationId === 0 || !completed) {
      return false
    }
    if (completed.opcode === frame.opcode) {
      this.sendAck(frame.correlationId, completed.kind, completed.result)
    } else {
      this.rejectInvalid(frame.correlationId, frame.opcode)
    }
    return true
  }

  complete(
    correlationId: number,
    opcode: TerminalMultiplexFrame['opcode'],
    kind: 1 | 3,
    result: TerminalMultiplexAckResult
  ): void {
    if (correlationId === 0) {
      return
    }
    this.completed.set(correlationId, { opcode, kind, result })
    while (this.completed.size > 1_024) {
      this.completed.delete(this.completed.keys().next().value ?? 0)
    }
    this.sendAck(correlationId, kind, result)
  }

  rejectInvalid(correlationId: number, opcode: TerminalMultiplexFrame['opcode']): void {
    this.complete(correlationId, opcode, 3, {
      status: 1,
      errorCode: TerminalMultiplexErrorCode.invalid_payload,
      seq: 0n
    })
  }
}
