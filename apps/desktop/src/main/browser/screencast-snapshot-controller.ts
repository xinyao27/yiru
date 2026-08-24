import { Buffer } from 'node:buffer'

import type { BrowserPageCdpLease, BrowserPageHandle } from './page/handle'
import { sendScreencastDebuggerCommand } from './screencast-debugger-command'
import { positiveInteger, positiveNumber } from './screencast-frame-metadata'
import type { BrowserScreencastFrameQueue } from './screencast-frame-queue'
import { readBrowserScreencastImageSize } from './screencast-image-size'
import type { BrowserScreencastOptions } from './screencast-types'

export class BrowserScreencastSnapshotController {
  private readonly cdp: BrowserPageCdpLease
  private deviceMetricsOverridden = false
  private generation = 0
  private readonly isStopped: () => boolean
  private navigationCaptureTimer: ReturnType<typeof setTimeout> | null = null
  private readonly options: BrowserScreencastOptions
  private readonly page: BrowserPageHandle
  private readonly queue: BrowserScreencastFrameQueue

  constructor(args: {
    cdp: BrowserPageCdpLease
    isStopped: () => boolean
    options: BrowserScreencastOptions
    page: BrowserPageHandle
    queue: BrowserScreencastFrameQueue
  }) {
    this.cdp = args.cdp
    this.isStopped = args.isStopped
    this.options = args.options
    this.page = args.page
    this.queue = args.queue
  }

  hasDeviceMetricsOverride(): boolean {
    return this.deviceMetricsOverridden
  }

  async applyDeviceMetricsOverride(): Promise<void> {
    const viewportWidth = positiveInteger(this.options.viewportWidth)
    const viewportHeight = positiveInteger(this.options.viewportHeight)
    if (!viewportWidth || !viewportHeight) {
      return
    }
    const deviceScaleFactor = positiveNumber(this.options.deviceScaleFactor) ?? 1
    await sendScreencastDebuggerCommand(this.cdp, 'Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor,
      mobile: this.options.mobile === true
    })
    await sendScreencastDebuggerCommand(this.cdp, 'Emulation.setVisibleSize', {
      width: viewportWidth,
      height: viewportHeight
    }).catch(() => {})
    this.deviceMetricsOverridden = true
  }

  async clearDeviceMetricsOverride(): Promise<void> {
    if (this.page.isClosed() || !this.cdp.isConnected()) {
      this.deviceMetricsOverridden = false
      return
    }
    await sendScreencastDebuggerCommand(this.cdp, 'Emulation.clearDeviceMetricsOverride')
    this.deviceMetricsOverridden = false
  }

  markLiveFrame(): void {
    this.generation += 1
    this.clearNavigationCaptureTimer()
  }

  scheduleNavigationFrameCapture(): void {
    if (this.isStopped()) {
      return
    }
    this.clearNavigationCaptureTimer()
    const generation = ++this.generation
    // Why: static navigation can complete without a new live frame.
    this.navigationCaptureTimer = setTimeout(() => {
      this.navigationCaptureTimer = null
      void this.emitSnapshotFrame(false, generation)
    }, 250)
  }

  emitInitialFrame(): void {
    void this.emitSnapshotFrame(true)
  }

  invalidate(): void {
    this.generation += 1
    this.clearNavigationCaptureTimer()
  }

  private clearNavigationCaptureTimer(): void {
    if (this.navigationCaptureTimer) {
      clearTimeout(this.navigationCaptureTimer)
      this.navigationCaptureTimer = null
    }
  }

  private isSnapshotStale(initialOnly: boolean, generation?: number): boolean {
    return (
      this.isStopped() ||
      (initialOnly && this.queue.hasSentFrame()) ||
      (generation !== undefined && generation !== this.generation)
    )
  }

  private async emitSnapshotFrame(initialOnly: boolean, generation?: number): Promise<void> {
    if (this.isSnapshotStale(initialOnly, generation)) {
      return
    }
    try {
      const viewportWidth = positiveInteger(this.options.viewportWidth)
      const viewportHeight = positiveInteger(this.options.viewportHeight)
      let image: Uint8Array | null = null
      await this.applyDeviceMetricsOverride()
      if (this.isSnapshotStale(initialOnly, generation)) {
        return
      }
      if (viewportWidth && viewportHeight && this.page.captureCompositorFrame) {
        try {
          const captured = await this.page.captureCompositorFrame({
            format: this.options.format,
            quality: this.options.quality,
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
      if (!image) {
        const result = await sendScreencastDebuggerCommand(this.cdp, 'Page.captureScreenshot', {
          format: this.options.format,
          ...(this.options.format === 'jpeg' ? { quality: this.options.quality } : {}),
          ...(viewportWidth && viewportHeight
            ? {
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
        if (this.isSnapshotStale(initialOnly, generation)) {
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
      if (this.isSnapshotStale(initialOnly, generation)) {
        return
      }
      const imageSize = readBrowserScreencastImageSize(image, this.options.format)
      const baseMetadata =
        viewportWidth && viewportHeight
          ? { deviceWidth: viewportWidth, deviceHeight: viewportHeight }
          : imageSize
            ? { deviceWidth: imageSize.width, deviceHeight: imageSize.height }
            : {}
      this.queue.queue({
        metadata: {
          ...baseMetadata,
          ...(imageSize ? { imageWidth: imageSize.width, imageHeight: imageSize.height } : {})
        },
        image
      })
    } catch {
      // Best effort: live Page.screencastFrame events still drive the stream.
    }
  }
}
