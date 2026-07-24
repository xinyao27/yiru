import {
  createWsOutboundBackpressureQueue,
  type WsOutboundBackpressureQueue
} from '@yiru/mobile-relay-protocol/outbound-backpressure'
import type { WebSocket } from 'ws'

import { encrypt, encryptBytes } from './e2ee-crypto'
import {
  createDesktopMobileE2EEV2OutboundQueue,
  type DesktopMobileE2EEV2OutboundItem
} from './mobile-e2ee-v2-desktop-outbound'
import type { DesktopMobileE2EEV2Session } from './mobile-e2ee-v2-desktop-session'

const MAX_BINARY_BUFFERED_AMOUNT = 8 * 1024 * 1024

export type E2EEChannelOutboundState = {
  ready: boolean
  sharedKey: Uint8Array | null
  v2Session: DesktopMobileE2EEV2Session | null
}

type E2EEChannelOutboundOptions = {
  ws: WebSocket
  getState: () => E2EEChannelOutboundState
  onError: (code: number, reason: string) => void
  maxTextReplyQueuedBytesPerGroup?: number
}

export class E2EEChannelOutbound {
  private readonly ws: WebSocket
  private readonly getState: () => E2EEChannelOutboundState
  private readonly onError: (code: number, reason: string) => void
  private readonly maxTextReplyQueuedBytesPerGroup: number | undefined
  private textReplyQueue: WsOutboundBackpressureQueue<string> | null = null
  private v2OutboundQueue: WsOutboundBackpressureQueue<DesktopMobileE2EEV2OutboundItem> | null =
    null

  constructor(options: E2EEChannelOutboundOptions) {
    this.ws = options.ws
    this.getState = options.getState
    this.onError = options.onError
    this.maxTextReplyQueuedBytesPerGroup = options.maxTextReplyQueuedBytesPerGroup
  }

  sendText(plaintext: string, groupKey?: string): boolean {
    const state = this.getState()
    if (!state.ready || this.ws.readyState !== this.ws.OPEN) {
      return false
    }
    if (state.v2Session) {
      this.sendV2({ kind: 'text', plaintext })
      return true
    }
    if (!state.sharedKey) {
      return false
    }
    this.ensureTextReplyQueue().enqueue(encrypt(plaintext, state.sharedKey), groupKey)
    return true
  }

  sendBinary(plaintext: Uint8Array<ArrayBufferLike>): boolean {
    const state = this.getState()
    if (!state.ready || this.ws.readyState !== this.ws.OPEN) {
      return false
    }
    if (state.v2Session) {
      this.sendV2({ kind: 'binary', plaintext })
      return true
    }
    if (!state.sharedKey || this.ws.bufferedAmount > MAX_BINARY_BUFFERED_AMOUNT) {
      return false
    }
    this.ws.send(Buffer.from(encryptBytes(plaintext, state.sharedKey)), { binary: true })
    return true
  }

  sendControl(message: unknown): void {
    const state = this.getState()
    if (state.v2Session) {
      this.sendV2({ kind: 'text', plaintext: JSON.stringify(message) })
    } else if (this.ws.readyState === this.ws.OPEN && state.sharedKey) {
      this.ws.send(encrypt(JSON.stringify(message), state.sharedKey))
    }
  }

  sendV2(item: DesktopMobileE2EEV2OutboundItem): void {
    const { v2Session } = this.getState()
    if (!v2Session || this.ws.readyState !== this.ws.OPEN) {
      return
    }
    if (!this.v2OutboundQueue) {
      this.v2OutboundQueue = createDesktopMobileE2EEV2OutboundQueue({
        ws: this.ws,
        session: v2Session,
        onOverflow: () => this.onError(1013, 'Outbound reply buffer overflow')
      })
    }
    this.v2OutboundQueue.enqueue(item)
  }

  destroy(): void {
    this.textReplyQueue?.dispose()
    this.textReplyQueue = null
    this.v2OutboundQueue?.dispose()
    this.v2OutboundQueue = null
  }

  private ensureTextReplyQueue(): WsOutboundBackpressureQueue<string> {
    if (!this.textReplyQueue) {
      this.textReplyQueue = createWsOutboundBackpressureQueue<string>({
        send: (frame) => this.ws.send(frame),
        byteLengthOf: (frame) => frame.length,
        getBufferedAmount: () => this.ws.bufferedAmount,
        isWritable: () => {
          const state = this.getState()
          return Boolean(state.sharedKey) && this.ws.readyState === this.ws.OPEN
        },
        onOverflow: () => this.onError(1013, 'Outbound reply buffer overflow'),
        ...(this.maxTextReplyQueuedBytesPerGroup !== undefined
          ? { maxQueuedBytesPerGroup: this.maxTextReplyQueuedBytesPerGroup }
          : {})
      })
    }
    return this.textReplyQueue
  }
}
