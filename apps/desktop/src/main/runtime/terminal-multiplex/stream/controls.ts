import { TerminalMultiplexErrorCode } from '@yiru/runtime-protocol/terminal-multiplex/error-codes'
import {
  decodeTerminalMultiplexInputRecord,
  decodeTerminalMultiplexKillRecord
} from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import { isTerminalInputLockedForClient } from '~main/runtime/rpc/methods/terminal-send-control'
import {
  updateViewportForClient,
  type TerminalViewportClient
} from '~main/runtime/rpc/methods/terminal-viewport-control'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import { TerminalMultiplexControlReplies, type TerminalMultiplexAckResult } from './control-replies'
import {
  decodeTerminalMultiplexClaim,
  decodeTerminalMultiplexResize,
  decodeTerminalMultiplexSignal
} from './records'

type TerminalMultiplexControlOptions = {
  runtime: YiruRuntimeService
  terminal: string
  ptyId: string
  client: TerminalViewportClient
  subscriptionKey: string
  transportGeneration: string
  sendAck: (correlationId: number, kind: 1 | 3, result: TerminalMultiplexAckResult) => void
  sendJson: (
    opcode: (typeof TerminalMultiplexOpcode)[keyof typeof TerminalMultiplexOpcode],
    seq: bigint,
    correlationId: number,
    value: Record<string, unknown>
  ) => void
  onNormalBufferResize: () => void
}

export class TerminalMultiplexStreamControls {
  private readonly options: TerminalMultiplexControlOptions
  private readonly replies: TerminalMultiplexControlReplies
  private inputSeq = 0n
  private inputTail = Promise.resolve()

  constructor(options: TerminalMultiplexControlOptions) {
    this.options = options
    this.replies = new TerminalMultiplexControlReplies(options.sendAck)
  }

  handle(frame: TerminalMultiplexFrame): boolean {
    if (
      this.options.runtime.getTerminalTransportGeneration(this.options.ptyId) !==
      this.options.transportGeneration
    ) {
      this.replies.complete(
        frame.correlationId,
        frame.opcode,
        frame.opcode === TerminalMultiplexOpcode.Input ? 1 : 3,
        {
          status: 1,
          errorCode: TerminalMultiplexErrorCode.stale_transport_generation,
          seq: 0n
        }
      )
      return true
    }
    if (this.replies.replay(frame)) {
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Input) {
      this.inputTail = this.inputTail.then(() => this.handleInput(frame))
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Resize) {
      void this.handleResize(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.ClaimViewport) {
      void this.handleClaim(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.ClearBuffer) {
      void this.handleClear(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Signal) {
      void this.handleSignal(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Kill) {
      void this.handleKill(frame)
      return true
    }
    return false
  }

  private async handleInput(frame: TerminalMultiplexFrame): Promise<void> {
    if (this.replies.replay(frame)) {
      return
    }
    const record = decodeTerminalMultiplexInputRecord(frame.payload)
    const expectedSeq = this.inputSeq + BigInt(record?.data.byteLength ?? 0)
    if (
      !record ||
      record.data.byteLength > 64 * 1024 ||
      frame.correlationId === 0 ||
      frame.seq !== expectedSeq
    ) {
      this.replies.complete(frame.correlationId, frame.opcode, 1, {
        status: 1,
        errorCode: record
          ? TerminalMultiplexErrorCode.input_gap
          : TerminalMultiplexErrorCode.invalid_payload,
        seq: this.inputSeq
      })
      return
    }
    if (
      record.kind === 0 &&
      isTerminalInputLockedForClient(this.options.runtime, this.options.ptyId, this.options.client)
    ) {
      this.replies.complete(frame.correlationId, frame.opcode, 1, {
        status: 1,
        errorCode: TerminalMultiplexErrorCode.input_locked,
        seq: this.inputSeq
      })
      return
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(record.data)
    } catch {
      this.replies.complete(frame.correlationId, frame.opcode, 1, {
        status: 1,
        errorCode: TerminalMultiplexErrorCode.invalid_payload,
        seq: this.inputSeq
      })
      return
    }
    try {
      const result = await this.options.runtime.sendTerminal(this.options.terminal, {
        text,
        enter: false,
        interrupt: false
      })
      if (!result.accepted) {
        throw new Error('terminal_input_rejected')
      }
      this.inputSeq = frame.seq
      this.replies.complete(frame.correlationId, frame.opcode, 1, {
        status: 0,
        errorCode: 0,
        seq: this.inputSeq
      })
    } catch {
      this.replies.complete(frame.correlationId, frame.opcode, 1, {
        status: 1,
        errorCode: TerminalMultiplexErrorCode.provider_unavailable,
        seq: this.inputSeq
      })
    }
  }

  private async handleResize(frame: TerminalMultiplexFrame): Promise<void> {
    const record = decodeTerminalMultiplexResize(frame.payload)
    if (!record || frame.correlationId === 0) {
      this.replies.rejectInvalid(frame.correlationId, frame.opcode)
      return
    }
    const result = await updateViewportForClient(
      this.options.runtime,
      this.options.ptyId,
      this.options.subscriptionKey,
      this.options.client,
      record,
      'desktop',
      'register',
      true
    ).catch(() => ({ updated: false, applied: false }))
    this.replies.complete(frame.correlationId, frame.opcode, 3, {
      status: result.updated ? 0 : 1,
      errorCode: result.updated ? 0 : TerminalMultiplexErrorCode.viewport_rejected,
      seq: 0n
    })
    this.options.sendJson(
      TerminalMultiplexOpcode.Resized,
      this.options.runtime.getTerminalWireByteSequence(this.options.ptyId),
      frame.correlationId,
      {
        cols: record.cols,
        rows: record.rows,
        displayMode: this.options.runtime.getMobileDisplayMode(this.options.ptyId),
        reason: 'apply-layout',
        applied: result.applied
      }
    )
    if (result.applied && !this.options.runtime.isTerminalAlternateScreen(this.options.ptyId)) {
      this.options.onNormalBufferResize()
    }
  }

  private async handleClaim(frame: TerminalMultiplexFrame): Promise<void> {
    const record = decodeTerminalMultiplexClaim(frame.payload)
    if (!record || frame.correlationId === 0 || record.clientId !== this.options.client.id) {
      this.replies.rejectInvalid(frame.correlationId, frame.opcode)
      return
    }
    if (record.action === 'release') {
      await this.options.runtime.unregisterRemoteDesktopViewer(
        this.options.ptyId,
        this.options.subscriptionKey
      )
      this.replies.complete(frame.correlationId, frame.opcode, 3, {
        status: 0,
        errorCode: 0,
        seq: 0n
      })
      return
    }
    const result = await updateViewportForClient(
      this.options.runtime,
      this.options.ptyId,
      this.options.subscriptionKey,
      this.options.client,
      record,
      'desktop',
      record.action === 'report' ? 'refresh' : 'register',
      record.action === 'claim'
    ).catch(() => ({ updated: false, applied: false }))
    this.replies.complete(frame.correlationId, frame.opcode, 3, {
      status: result.updated ? 0 : 1,
      errorCode: result.updated ? 0 : TerminalMultiplexErrorCode.viewport_rejected,
      seq: 0n
    })
  }

  private async handleClear(frame: TerminalMultiplexFrame): Promise<void> {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (value?.operation !== 'request' || frame.correlationId === 0) {
      this.replies.rejectInvalid(frame.correlationId, frame.opcode)
      return
    }
    await this.options.runtime.clearTerminalBuffer(this.options.terminal)
    const seq = this.options.runtime.getTerminalWireByteSequence(this.options.ptyId)
    this.replies.complete(frame.correlationId, frame.opcode, 3, {
      status: 0,
      errorCode: 0,
      seq
    })
    this.options.runtime.broadcastTerminalMultiplexClear(
      this.options.ptyId,
      seq,
      frame.correlationId,
      this.options.client.id
    )
  }

  private async handleSignal(frame: TerminalMultiplexFrame): Promise<void> {
    const signal = decodeTerminalMultiplexSignal(frame.payload)
    const accepted = signal
      ? await this.options.runtime.sendTerminalSignal(this.options.ptyId, signal)
      : false
    this.replies.complete(frame.correlationId, frame.opcode, 3, {
      status: accepted ? 0 : 1,
      errorCode: accepted
        ? 0
        : signal
          ? TerminalMultiplexErrorCode.unsupported_signal
          : TerminalMultiplexErrorCode.invalid_payload,
      seq: 0n
    })
  }

  private async handleKill(frame: TerminalMultiplexFrame): Promise<void> {
    const record = decodeTerminalMultiplexKillRecord(frame.payload)
    if (!record || frame.correlationId === 0) {
      this.replies.rejectInvalid(frame.correlationId, frame.opcode)
      return
    }
    const stopped = await this.options.runtime.stopTerminalTransport(
      this.options.ptyId,
      record.keepHistory
    )
    this.replies.complete(frame.correlationId, frame.opcode, 3, {
      status: stopped ? 0 : 1,
      errorCode: stopped ? 0 : TerminalMultiplexErrorCode.provider_unavailable,
      seq: 0n
    })
  }
}
