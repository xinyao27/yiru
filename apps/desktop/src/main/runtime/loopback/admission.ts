import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

const LOOPBACK_ADDRESS = '127.0.0.1'
const LOOPBACK_TOKEN_BYTES = 32
const LOOPBACK_FAILURE_WINDOW_MS = 60_000
const LOOPBACK_MAX_FAILURES = 8

export type LoopbackRendererIdentity = {
  origin: string
  webContentsId: number
}

export class RuntimeLoopbackAdmission {
  private readonly processToken = randomBytes(LOOPBACK_TOKEN_BYTES)
  private readonly failedAt: number[] = []
  private renderer: LoopbackRendererIdentity | null = null

  authorizeRenderer(webContentsId: number, rendererUrl: string): void {
    const origin = resolveAllowedRendererOrigin(rendererUrl)
    this.renderer = { origin, webContentsId }
  }

  getRendererIdentity(): LoopbackRendererIdentity | null {
    return this.renderer
  }

  copyProcessToken(): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(this.processToken.byteLength)
    copy.set(this.processToken)
    return copy
  }

  admitUpgrade(request: IncomingMessage, expectedHost: string): boolean {
    this.pruneFailures()
    const origin = request.headers.origin
    return (
      this.failedAt.length < LOOPBACK_MAX_FAILURES &&
      request.socket.remoteAddress === LOOPBACK_ADDRESS &&
      request.headers.host === expectedHost &&
      typeof origin === 'string' &&
      origin !== 'null' &&
      origin === this.renderer?.origin
    )
  }

  admitToken(candidate: Uint8Array<ArrayBufferLike>): boolean {
    const normalized = Buffer.alloc(LOOPBACK_TOKEN_BYTES)
    normalized.set(candidate.subarray(0, LOOPBACK_TOKEN_BYTES))
    const matches = timingSafeEqual(normalized, this.processToken)
    if (candidate.byteLength === LOOPBACK_TOKEN_BYTES && matches) {
      return true
    }
    this.failedAt.push(Date.now())
    return false
  }

  private pruneFailures(): void {
    const oldestAllowed = Date.now() - LOOPBACK_FAILURE_WINDOW_MS
    while (this.failedAt[0] !== undefined && this.failedAt[0] < oldestAllowed) {
      this.failedAt.shift()
    }
  }
}

export const RUNTIME_LOOPBACK_ADDRESS = LOOPBACK_ADDRESS

function resolveAllowedRendererOrigin(rendererUrl: string): string {
  const renderer = new URL(rendererUrl)
  const developmentRendererUrl = process.env.ELECTRON_RENDERER_URL
  if (developmentRendererUrl) {
    const developmentOrigin = new URL(developmentRendererUrl).origin
    if (renderer.origin !== developmentOrigin) {
      throw new Error('Runtime loopback credentials requested by an unexpected renderer origin')
    }
    return developmentOrigin
  }
  if (renderer.protocol !== 'file:') {
    throw new Error('Runtime loopback credentials require the packaged file renderer')
  }
  // Why: Chromium serializes a loadFile WebSocket Origin as file:// rather
  // than URL.origin's opaque "null" value. This is the exact packaged origin.
  return 'file://'
}
