/* eslint-disable max-lines -- Why: screencast setup, CDP lifecycle, metadata normalization, and stream teardown stay together so frame behavior cannot drift across files. */
import { Buffer } from 'node:buffer'

import {
  BrowserScreencastOpcode,
  encodeBrowserScreencastFrame,
  type BrowserScreencastFormat,
  type BrowserScreencastFrameMetadata
} from '~shared/browser/screencast-protocol'

import { BrowserError } from './cdp-bridge'
import type { BrowserPageCdpEvent, BrowserPageCdpLease, BrowserPageHandle } from './page/handle'
import { readBrowserScreencastImageSize } from './screencast-image-size'

const DEBUGGER_COMMAND_TIMEOUT_MS = 8_000
const BACKPRESSURE_RETRY_MS = 50

export type BrowserScreencastOptions = {
  format: BrowserScreencastFormat
  quality: number
  maxWidth: number
  maxHeight: number
  viewportWidth?: number
  viewportHeight?: number
  deviceScaleFactor?: number
  mobile?: boolean
  everyNthFrame: number
  minFrameIntervalMs: number
  onFrame: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  onEvent?: (event: BrowserScreencastEvent) => void
  onError?: (message: string) => void
}

export type BrowserScreencastSession = { stop: () => void; done: Promise<void> }

type BrowserScreencastEvent =
  | { type: 'dialog'; dialogType: string; message: string }
  | { type: 'dialogClosed' }

type PendingScreencastFrame = {
  metadata: BrowserScreencastFrameMetadata
  image: Uint8Array
  sessionId?: number
}

type ScreencastImageSize = {
  width: number
  height: number
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readFrameMetadata(raw: unknown): BrowserScreencastFrameMetadata {
  const metadata = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    offsetTop: finiteNumber(metadata.offsetTop),
    pageScaleFactor: finiteNumber(metadata.pageScaleFactor),
    deviceWidth: finiteNumber(metadata.deviceWidth),
    deviceHeight: finiteNumber(metadata.deviceHeight),
    imageWidth: finiteNumber(metadata.imageWidth),
    imageHeight: finiteNumber(metadata.imageHeight),
    scrollOffsetX: finiteNumber(metadata.scrollOffsetX),
    scrollOffsetY: finiteNumber(metadata.scrollOffsetY),
    timestamp: finiteNumber(metadata.timestamp)
  }
}

function isNear(value: number, expected: number): boolean {
  return Math.abs(value - expected) <= Math.max(2, expected * 0.02)
}

function scaleToFit(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): {
  width: number
  height: number
} {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  }
}

function isNearSize(
  actual: { width: number; height: number },
  expected: { width: number; height: number }
): boolean {
  return isNear(actual.width, expected.width) && isNear(actual.height, expected.height)
}

function selectFrameDeviceSize(
  reportedSize: number | undefined,
  requestedCssSize: number | null,
  imageSize: number | undefined
): number | undefined {
  if (requestedCssSize) {
    // Why: paired clients own the remote browser viewport. If Chromium briefly
    // reports the host BrowserView size, publishing that size makes the client
    // compensate with crop/contain math and exposes blank compositor space.
    return requestedCssSize
  }
  return reportedSize ?? imageSize
}

function isLiveFrameCompatibleWithViewport(
  imageSize: ScreencastImageSize | null,
  options: BrowserScreencastOptions
): boolean {
  const viewportWidth = positiveInteger(options.viewportWidth)
  const viewportHeight = positiveInteger(options.viewportHeight)
  if (!viewportWidth || !viewportHeight) {
    return true
  }
  if (!imageSize) {
    return true
  }
  const deviceScaleFactor = positiveNumber(options.deviceScaleFactor) ?? 1
  const cssViewport = { width: viewportWidth, height: viewportHeight }
  const deviceViewport = {
    width: Math.round(viewportWidth * deviceScaleFactor),
    height: Math.round(viewportHeight * deviceScaleFactor)
  }
  const scaledDeviceViewport = scaleToFit(
    deviceViewport.width,
    deviceViewport.height,
    options.maxWidth,
    options.maxHeight
  )
  // Why: Chromium can stream CSS-sized, DPR-sized, or maxWidth/maxHeight-scaled
  // bitmaps for the same emulated viewport. All are client-authoritative; stale
  // host BrowserView frames are the incompatible ones we need to drop.
  return (
    isNearSize(imageSize, cssViewport) ||
    isNearSize(imageSize, deviceViewport) ||
    isNearSize(imageSize, scaledDeviceViewport)
  )
}

function enrichFrameMetadata(
  metadata: BrowserScreencastFrameMetadata,
  imageSize: ScreencastImageSize | null,
  options: BrowserScreencastOptions
): BrowserScreencastFrameMetadata {
  const viewportWidth = positiveInteger(options.viewportWidth)
  const viewportHeight = positiveInteger(options.viewportHeight)
  const enriched: BrowserScreencastFrameMetadata = { ...metadata }
  const deviceWidth = selectFrameDeviceSize(enriched.deviceWidth, viewportWidth, imageSize?.width)
  const deviceHeight = selectFrameDeviceSize(
    enriched.deviceHeight,
    viewportHeight,
    imageSize?.height
  )
  const imageWidth = imageSize?.width ?? enriched.imageWidth
  const imageHeight = imageSize?.height ?? enriched.imageHeight
  if (deviceWidth !== undefined) {
    enriched.deviceWidth = deviceWidth
  }
  if (deviceHeight !== undefined) {
    enriched.deviceHeight = deviceHeight
  }
  if (imageWidth !== undefined) {
    enriched.imageWidth = imageWidth
  }
  if (imageHeight !== undefined) {
    enriched.imageHeight = imageHeight
  }
  return enriched
}

function positiveInteger(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function positiveNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

async function sendDebuggerCommand(
  cdp: BrowserPageCdpLease,
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      Promise.resolve().then(() => cdp.sendCommand(method, params)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Timed out while running ${method}.`))
        }, DEBUGGER_COMMAND_TIMEOUT_MS)
      })
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

export async function startBrowserScreencast(
  page: BrowserPageHandle,
  options: BrowserScreencastOptions
): Promise<BrowserScreencastSession> {
  if (page.isClosed()) {
    throw new BrowserError('browser_tab_not_found', 'Browser tab is no longer available')
  }

  let cdp: BrowserPageCdpLease | null = null
  try {
    cdp = page.acquireCdp()
  } catch {
    throw new BrowserError(
      'browser_error',
      'Could not attach debugger. DevTools may already be open for this tab.'
    )
  }
  const activeCdp = cdp

  let closed = false
  let stopping = false
  let seq = 0
  let lastFrameSentAt = 0
  let deviceMetricsOverridden = false
  let snapshotGeneration = 0
  let navigationCaptureTimer: ReturnType<typeof setTimeout> | null = null
  let pendingFrame: PendingScreencastFrame | null = null
  let pendingFrameTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribeCdp = (): void => {}
  let resolveDone!: () => void
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const clearNavigationCaptureTimer = (): void => {
    if (navigationCaptureTimer) {
      clearTimeout(navigationCaptureTimer)
      navigationCaptureTimer = null
    }
  }

  const ackScreencastFrame = (sessionId: number | undefined): void => {
    if (sessionId === undefined) {
      return
    }
    // Why: CDP only sends the next frame after ACK; delaying ACK for
    // throttled frames applies back-pressure before Chromium/base64 work piles up.
    void sendDebuggerCommand(activeCdp, 'Page.screencastFrameAck', { sessionId }).catch(() => {})
  }

  const clearPendingFrameTimer = (ackPending = false): void => {
    const pending = pendingFrame
    pendingFrame = null
    if (pendingFrameTimer) {
      clearTimeout(pendingFrameTimer)
      pendingFrameTimer = null
    }
    if (ackPending) {
      ackScreencastFrame(pending?.sessionId)
    }
  }

  const emitFrame = (frame: PendingScreencastFrame): boolean => {
    if (closed || stopping) {
      return false
    }
    lastFrameSentAt = Date.now()
    const accepted = options.onFrame(
      encodeBrowserScreencastFrame({
        opcode: BrowserScreencastOpcode.Frame,
        seq: seq++,
        format: options.format,
        // Why: Chromium sometimes omits device dimensions on static/mobile
        // pages; carrying viewport/image dimensions prevents client stretch.
        metadata: frame.metadata,
        image: frame.image
      })
    )
    return accepted !== false
  }

  const schedulePendingFrameRetry = (): void => {
    if (pendingFrameTimer || closed || stopping) {
      return
    }
    pendingFrameTimer = setTimeout(() => {
      pendingFrameTimer = null
      const latest = pendingFrame
      pendingFrame = null
      if (closed || stopping || !latest) {
        return
      }
      if (emitFrame(latest)) {
        ackScreencastFrame(latest.sessionId)
      } else {
        pendingFrame = latest
        schedulePendingFrameRetry()
      }
    }, BACKPRESSURE_RETRY_MS)
  }

  const queueFrame = (frame: PendingScreencastFrame): void => {
    if (closed || stopping) {
      return
    }
    const now = Date.now()
    const elapsed = now - lastFrameSentAt
    if (
      options.minFrameIntervalMs <= 0 ||
      lastFrameSentAt === 0 ||
      elapsed >= options.minFrameIntervalMs
    ) {
      clearPendingFrameTimer(true)
      if (emitFrame(frame)) {
        ackScreencastFrame(frame.sessionId)
      } else {
        pendingFrame = frame
        schedulePendingFrameRetry()
      }
      return
    }

    // Why: static UI changes can be the last frame Chromium emits. Keep the
    // newest throttled frame and flush it after the interval instead of
    // dropping it forever.
    if (pendingFrame?.sessionId !== frame.sessionId) {
      ackScreencastFrame(pendingFrame?.sessionId)
    }
    pendingFrame = frame
    if (pendingFrameTimer) {
      return
    }
    pendingFrameTimer = setTimeout(
      () => {
        pendingFrameTimer = null
        const latest = pendingFrame
        pendingFrame = null
        if (closed || stopping || !latest) {
          return
        }
        if (emitFrame(latest)) {
          ackScreencastFrame(latest.sessionId)
        } else {
          pendingFrame = latest
          schedulePendingFrameRetry()
        }
      },
      Math.max(0, options.minFrameIntervalMs - elapsed)
    )
  }

  const clearDeviceMetricsOverride = async (): Promise<void> => {
    if (page.isClosed() || !activeCdp.isConnected()) {
      deviceMetricsOverridden = false
      return
    }
    await sendDebuggerCommand(activeCdp, 'Emulation.clearDeviceMetricsOverride')
    deviceMetricsOverridden = false
  }

  const applyDeviceMetricsOverride = async (): Promise<void> => {
    const viewportWidth = positiveInteger(options.viewportWidth)
    const viewportHeight = positiveInteger(options.viewportHeight)
    if (!viewportWidth || !viewportHeight) {
      return
    }
    const deviceScaleFactor = positiveNumber(options.deviceScaleFactor) ?? 1
    // Why: Back/Forward and cross-process navigations can drop emulation while
    // the screencast remains attached. Reapply before fallback captures so the
    // page lays out at the client pane size, not the host BrowserView size.
    await sendDebuggerCommand(activeCdp, 'Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor,
      mobile: options.mobile === true
    })
    await sendDebuggerCommand(activeCdp, 'Emulation.setVisibleSize', {
      width: viewportWidth,
      height: viewportHeight
    }).catch(() => {})
    deviceMetricsOverridden = true
  }

  const finish = (): void => {
    if (closed) {
      return
    }
    closed = true
    clearNavigationCaptureTimer()
    clearPendingFrameTimer()
    unsubscribeCdp()
    activeCdp.release()
    resolveDone()
  }

  const handleDetach = (): void => {
    options.onError?.('Browser debugger detached while streaming.')
    finish()
  }

  const handleMessage = (method: string, params: unknown): void => {
    if (closed) {
      return
    }
    if (stopping && method !== 'Page.screencastFrame') {
      return
    }
    if (method === 'Page.javascriptDialogOpening') {
      const payload =
        params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
      options.onEvent?.({
        type: 'dialog',
        dialogType: typeof payload.type === 'string' ? payload.type : 'alert',
        message: typeof payload.message === 'string' ? payload.message : 'Browser dialog'
      })
      return
    }
    if (method === 'Page.javascriptDialogClosed') {
      options.onEvent?.({ type: 'dialogClosed' })
      return
    }
    if (method === 'Page.frameNavigated') {
      const payload =
        params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
      const frame = payload.frame && typeof payload.frame === 'object' ? payload.frame : null
      if (!frame || !('parentId' in frame)) {
        scheduleNavigationFrameCapture()
      }
      return
    }
    if (method === 'Page.loadEventFired') {
      scheduleNavigationFrameCapture()
      return
    }
    if (method !== 'Page.screencastFrame') {
      return
    }
    const payload = params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
    const data = typeof payload.data === 'string' ? payload.data : null
    const sessionId = typeof payload.sessionId === 'number' ? payload.sessionId : null
    if (!data || sessionId === null) {
      return
    }
    if (stopping) {
      void sendDebuggerCommand(activeCdp, 'Page.screencastFrameAck', { sessionId }).catch(() => {})
      return
    }

    try {
      const image = new Uint8Array(Buffer.from(data, 'base64'))
      // Why: image dimension parsing happens for every live frame; share the
      // result between stale-frame rejection and metadata enrichment.
      const imageSize = readBrowserScreencastImageSize(image, options.format)
      if (!isLiveFrameCompatibleWithViewport(imageSize, options)) {
        // Why: after tab switches/navigation Chromium can briefly stream the
        // host surface instead of the requested client viewport. Dropping that
        // frame keeps the client from rendering server-sized blank gutters.
        ackScreencastFrame(sessionId)
        scheduleNavigationFrameCapture()
        return
      }
      snapshotGeneration += 1
      clearNavigationCaptureTimer()
      queueFrame({
        metadata: enrichFrameMetadata(readFrameMetadata(payload.metadata), imageSize, options),
        image,
        sessionId
      })
    } catch {
      ackScreencastFrame(sessionId)
    }
  }

  const scheduleNavigationFrameCapture = (): void => {
    if (closed || stopping) {
      return
    }
    clearNavigationCaptureTimer()
    const generation = ++snapshotGeneration
    // Why: static pages can finish navigation without producing a live
    // screencast frame, leaving mobile on the previous page image.
    navigationCaptureTimer = setTimeout(() => {
      navigationCaptureTimer = null
      void emitSnapshotFrame(false, generation)
    }, 250)
  }

  const isSnapshotStale = (initialOnly: boolean, generation?: number): boolean =>
    closed ||
    stopping ||
    (initialOnly && seq > 0) ||
    (generation !== undefined && generation !== snapshotGeneration)

  const emitSnapshotFrame = async (initialOnly: boolean, generation?: number): Promise<void> => {
    if (isSnapshotStale(initialOnly, generation)) {
      return
    }
    try {
      const viewportWidth = positiveInteger(options.viewportWidth)
      const viewportHeight = positiveInteger(options.viewportHeight)
      let image: Uint8Array | null = null
      await applyDeviceMetricsOverride()
      if (isSnapshotStale(initialOnly, generation)) {
        return
      }
      if (viewportWidth && viewportHeight && page.captureCompositorFrame) {
        try {
          // Why: CDP captureScreenshot can tile BrowserView surfaces under
          // mobile emulation; Electron captures the actual visible viewport.
          const captured = await page.captureCompositorFrame({
            format: options.format,
            quality: options.quality,
            captureBeyondViewport: false,
            clip: { x: 0, y: 0, width: viewportWidth, height: viewportHeight, scale: 1 }
          })
          if (captured) {
            image = new Uint8Array(Buffer.from(captured.data, 'base64'))
          }
        } catch {
          image = null
        }
      }
      // Why: Page.startScreencast may not produce a frame for an already-painted
      // blank/static page, which leaves remote browser clients showing only the shell.
      if (!image) {
        const result = await sendDebuggerCommand(activeCdp, 'Page.captureScreenshot', {
          format: options.format,
          ...(options.format === 'jpeg' ? { quality: options.quality } : {}),
          ...(viewportWidth && viewportHeight
            ? {
                // Why: mobile emulation + DPR can make Chromium capture a larger
                // surface than the visual viewport. Clipping keeps fallback frames
                // in the same coordinate space as live screencast frames.
                clip: {
                  x: 0,
                  y: 0,
                  width: viewportWidth,
                  height: viewportHeight,
                  scale: 1
                }
              }
            : {}),
          captureBeyondViewport: false
        })
        if (isSnapshotStale(initialOnly, generation)) {
          return
        }
        const payload =
          result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
        const data = typeof payload.data === 'string' ? payload.data : null
        if (!data) {
          return
        }
        image = new Uint8Array(Buffer.from(data, 'base64'))
      }
      if (isSnapshotStale(initialOnly, generation)) {
        return
      }
      const imageSize = readBrowserScreencastImageSize(image, options.format)
      const baseMetadata =
        viewportWidth && viewportHeight
          ? { deviceWidth: viewportWidth, deviceHeight: viewportHeight }
          : imageSize
            ? { deviceWidth: imageSize.width, deviceHeight: imageSize.height }
            : {}
      queueFrame({
        // Why: static pages may only produce this fallback capture. Without
        // dimensions, mobile clients stretch it to the phone aspect ratio.
        metadata: {
          ...baseMetadata,
          ...(imageSize ? { imageWidth: imageSize.width, imageHeight: imageSize.height } : {})
        },
        image
      })
    } catch {
      // Best effort only: live Page.screencastFrame events still drive the stream.
    }
  }

  const handleCdpEvent = (event: BrowserPageCdpEvent): void => {
    if (event.type === 'detached') {
      handleDetach()
      return
    }
    handleMessage(event.method, event.params)
  }
  unsubscribeCdp = activeCdp.subscribe(handleCdpEvent)

  try {
    await sendDebuggerCommand(activeCdp, 'Page.enable')
    await applyDeviceMetricsOverride()
    await sendDebuggerCommand(activeCdp, 'Page.startScreencast', {
      format: options.format,
      quality: options.quality,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      everyNthFrame: options.everyNthFrame
    })
    void emitSnapshotFrame(true)
  } catch (error) {
    if (deviceMetricsOverridden) {
      await clearDeviceMetricsOverride().catch(() => {})
    }
    finish()
    throw new BrowserError(
      'browser_error',
      error instanceof Error ? error.message : 'Failed to start browser screencast.'
    )
  }

  return {
    stop: () => {
      if (closed) {
        return
      }
      stopping = true
      snapshotGeneration += 1
      clearNavigationCaptureTimer()
      clearPendingFrameTimer(true)
      try {
        void (async () => {
          await sendDebuggerCommand(activeCdp, 'Page.stopScreencast').catch(() => {})
          if (deviceMetricsOverridden) {
            await clearDeviceMetricsOverride().catch(() => {})
          }
        })().finally(finish)
      } catch {
        finish()
      }
    },
    done
  }
}
