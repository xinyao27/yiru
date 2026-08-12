import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'

import type { RemoteRuntimeMultiplexedTerminalCallbacks } from '../types'
import { decodeRemoteTerminalSideEffectBatch } from './side-effects'

type PendingEvent = { seq: bigint; publish: () => void }

export class RemoteTerminalOrderedEvents {
  private readonly callbacks: RemoteRuntimeMultiplexedTerminalCallbacks
  private readonly pending: PendingEvent[] = []

  constructor(callbacks: RemoteRuntimeMultiplexedTerminalCallbacks) {
    this.callbacks = callbacks
  }

  handle(frame: TerminalMultiplexFrame): boolean {
    if (frame.opcode === TerminalMultiplexOpcode.SideEffectBatch) {
      const batch = decodeRemoteTerminalSideEffectBatch(frame.payload)
      if (!batch) {
        this.callbacks.onError?.('Invalid remote terminal side-effect batch.')
        return true
      }
      this.pending.push({
        seq: frame.seq,
        publish: () => this.callbacks.onSideEffectBatch?.(batch)
      })
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Metadata) {
      const metadata = decodeTerminalMultiplexJson(frame.payload)
      if (!metadata) {
        this.callbacks.onError?.('Invalid remote terminal metadata.')
        return true
      }
      this.pending.push({
        seq: frame.seq,
        publish: () => this.callbacks.onMetadata?.(metadata)
      })
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.ClearBuffer) {
      const clear = decodeTerminalMultiplexJson(frame.payload)
      if (clear?.operation !== 'applied') {
        this.callbacks.onError?.('Invalid remote terminal clear record.')
        return true
      }
      this.pending.push({ seq: frame.seq, publish: () => this.callbacks.onClearBuffer?.() })
      return true
    }
    return false
  }

  publishThrough(parsedSeq: bigint): void {
    let index = 0
    while (this.pending[index] && this.pending[index]!.seq <= parsedSeq) {
      this.pending[index]!.publish()
      index += 1
    }
    if (index > 0) {
      this.pending.splice(0, index)
    }
  }

  clear(): void {
    this.pending.splice(0)
  }
}
