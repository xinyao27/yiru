import type { ClientLink } from '@orpc/client'

import type { BrowserScreencastFrame } from './browser-screencast-protocol'
import { readRuntimeOrpcSubscriptionDetails } from './runtime-orpc-client'
import {
  isAsyncIterator,
  isRuntimeOrpcBrowserStreamPath,
  isRuntimeOrpcTerminalStreamPath
} from './runtime-orpc-compatibility'
import {
  consumeRuntimeOrpcIterator,
  createRuntimeOrpcEventStream,
  type RuntimeOrpcEventStream
} from './runtime-orpc-stream'

type RuntimeOrpcStreamConnection = {
  generation: number
  link: ClientLink<Record<never, never>> | null
}

type RuntimeOrpcSubscriptionOptions = {
  resolveConnection: (signal: AbortSignal) => Promise<RuntimeOrpcStreamConnection>
  shouldReplay: (generation: number, signal: AbortSignal) => boolean
  waitForReplay: (generation: number, signal: AbortSignal) => Promise<void>
  registerTerminalStream: (streamId: number, listener: (event: unknown) => void) => () => void
  isClosed: () => boolean
}

type ActiveBrowserStream = {
  token: symbol
  isReady: boolean
  onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  cancel: () => void
}

export class MobileRuntimeOrpcSubscriptions {
  private readonly options: RuntimeOrpcSubscriptionOptions
  private activeBrowserStream: ActiveBrowserStream | null = null

  constructor(options: RuntimeOrpcSubscriptionOptions) {
    this.options = options
  }

  create(path: readonly string[], input: unknown, signal?: AbortSignal): AsyncIterator<unknown> {
    const details = readRuntimeOrpcSubscriptionDetails(signal)
    const stream = createRuntimeOrpcEventStream(async (events) => {
      const onAbort = (): void => events.cancel(signal?.reason)
      if (signal?.aborted) {
        onAbort()
      } else {
        signal?.addEventListener('abort', onAbort, { once: true })
      }
      try {
        await this.run(events, path, input, details?.onBinaryFrame)
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    })
    return stream
  }

  handleBrowserBinaryFrame(frame: BrowserScreencastFrame): boolean {
    const stream = this.activeBrowserStream
    if (!stream?.isReady || !stream.onBinaryFrame) {
      return false
    }
    stream.onBinaryFrame(frame)
    return true
  }

  cancelBrowserStream(): void {
    this.clearBrowserStream(true)
  }

  disconnected(): void {
    this.clearBrowserStream(false)
  }

  close(): void {
    this.clearBrowserStream(true)
  }

  private async run(
    stream: RuntimeOrpcEventStream,
    path: readonly string[],
    input: unknown,
    onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  ): Promise<void> {
    while (!stream.signal.aborted && !this.options.isClosed()) {
      const connection = await this.options.resolveConnection(stream.signal)
      if (!connection.link) {
        await this.options.waitForReplay(connection.generation, stream.signal)
        continue
      }
      const terminalCleanups: (() => void)[] = []
      const browserToken = isRuntimeOrpcBrowserStreamPath(path)
        ? this.beginBrowserStream(stream, onBinaryFrame)
        : null
      try {
        const output = await connection.link.call(path, input, {
          context: {},
          signal: stream.signal
        })
        if (!isAsyncIterator(output)) {
          throw new Error('Runtime oRPC stream returned a non-iterator response')
        }
        const outcome = await consumeRuntimeOrpcIterator(output, stream, (event) => {
          this.handleEvent(path, event, stream, terminalCleanups, browserToken)
        })
        if (outcome === 'cancelled' || stream.signal.aborted) {
          return
        }
        if (!this.options.shouldReplay(connection.generation, stream.signal)) {
          return
        }
      } catch (error) {
        if (!this.options.shouldReplay(connection.generation, stream.signal)) {
          throw error
        }
      } finally {
        for (const cleanup of terminalCleanups) {
          cleanup()
        }
        if (browserToken) {
          this.endBrowserAttempt(browserToken)
        }
      }
      await this.options.waitForReplay(connection.generation, stream.signal)
    }
  }

  private handleEvent(
    path: readonly string[],
    event: unknown,
    stream: RuntimeOrpcEventStream,
    terminalCleanups: (() => void)[],
    browserToken: symbol | null
  ): void {
    if (isRuntimeOrpcTerminalStreamPath(path) && isSubscribedStreamEvent(event)) {
      terminalCleanups.push(
        this.options.registerTerminalStream(event.streamId, (binaryEvent) => {
          stream.push(binaryEvent)
        })
      )
    }
    if (browserToken && isBrowserReadyEvent(event)) {
      const browser = this.activeBrowserStream
      if (browser?.token === browserToken) {
        browser.isReady = true
      }
    }
  }

  private beginBrowserStream(
    stream: RuntimeOrpcEventStream,
    onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  ): symbol {
    this.clearBrowserStream(true)
    const token = Symbol('mobile-runtime-orpc-browser-stream')
    this.activeBrowserStream = { token, isReady: false, onBinaryFrame, cancel: stream.cancel }
    return token
  }

  private endBrowserAttempt(token: symbol): void {
    if (this.activeBrowserStream?.token === token) {
      this.activeBrowserStream = null
    }
  }

  private clearBrowserStream(cancel: boolean): void {
    const stream = this.activeBrowserStream
    this.activeBrowserStream = null
    if (cancel) {
      stream?.cancel()
    }
  }
}

function isSubscribedStreamEvent(
  event: unknown
): event is { type: 'subscribed'; streamId: number } {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    event.type === 'subscribed' &&
    'streamId' in event &&
    typeof event.streamId === 'number'
  )
}

function isBrowserReadyEvent(event: unknown): boolean {
  return typeof event === 'object' && event !== null && 'type' in event && event.type === 'ready'
}
