import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'

import { decodeMobileTerminalSideEffectBatch } from './side-effects'
import type { MobileTerminalCallbacks } from './types'

export class MobileTerminalOrderedEvents {
  private readonly callbacks: MobileTerminalCallbacks
  private readonly pending: { seq: bigint; publish: () => void }[] = []

  constructor(callbacks: MobileTerminalCallbacks) {
    this.callbacks = callbacks
  }

  handle(frame: TerminalMultiplexFrame): boolean {
    if (frame.opcode === TerminalMultiplexOpcode.Metadata) {
      const metadata = decodeTerminalMultiplexJson(frame.payload)
      if (!metadata) {
        this.callbacks.onError?.('Mobile terminal metadata is invalid.')
      } else {
        this.pending.push({
          seq: frame.seq,
          publish: () => this.callbacks.onMetadata?.(metadata)
        })
      }
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.ClearBuffer) {
      const clear = decodeTerminalMultiplexJson(frame.payload)
      if (clear?.operation !== 'applied') {
        this.callbacks.onError?.('Mobile terminal clear-buffer record is invalid.')
      } else {
        this.pending.push({
          seq: frame.seq,
          publish: () => this.callbacks.onClearBuffer?.()
        })
      }
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.SideEffectBatch) {
      const batch = decodeMobileTerminalSideEffectBatch(frame.payload)
      if (!batch) {
        this.callbacks.onError?.('Mobile terminal side-effect batch is invalid.')
      } else {
        this.pending.push({
          seq: frame.seq,
          publish: () => this.callbacks.onSideEffectBatch?.(batch)
        })
      }
      return true
    }
    return false
  }

  publishThrough(parsedSeq: bigint): void {
    let count = 0
    while (this.pending[count]?.seq !== undefined) {
      const event = this.pending[count]!
      if (event.seq > parsedSeq) {
        break
      }
      event.publish()
      count += 1
    }
    if (count > 0) {
      this.pending.splice(0, count)
    }
  }

  clear(): void {
    this.pending.splice(0)
  }
}
