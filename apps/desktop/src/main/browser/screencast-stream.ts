import { Buffer } from 'node:buffer'

import { BrowserError } from './cdp-bridge'
import type { BrowserPageCdpEvent, BrowserPageCdpLease, BrowserPageHandle } from './page/handle'
import { sendScreencastDebuggerCommand } from './screencast-debugger-command'
import {
  enrichScreencastFrameMetadata,
  isLiveScreencastFrameCompatible,
  readScreencastFrameMetadata
} from './screencast-frame-metadata'
import { BrowserScreencastFrameQueue } from './screencast-frame-queue'
import { readBrowserScreencastImageSize } from './screencast-image-size'
import { BrowserScreencastSnapshotController } from './screencast-snapshot-controller'
import type { BrowserScreencastOptions, BrowserScreencastSession } from './screencast-types'

export type { BrowserScreencastOptions, BrowserScreencastSession } from './screencast-types'

export async function startBrowserScreencast(
  page: BrowserPageHandle,
  options: BrowserScreencastOptions
): Promise<BrowserScreencastSession> {
  if (page.isClosed()) {
    throw new BrowserError('browser_tab_not_found', 'Browser tab is no longer available')
  }

  let cdp: BrowserPageCdpLease
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
  let unsubscribeCdp = (): void => {}
  let resolveDone!: () => void
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  const isStopped = (): boolean => closed || stopping
  const frameQueue = new BrowserScreencastFrameQueue(activeCdp, options, isStopped)
  const snapshots = new BrowserScreencastSnapshotController({
    cdp: activeCdp,
    isStopped,
    options,
    page,
    queue: frameQueue
  })

  const finish = (): void => {
    if (closed) {
      return
    }
    closed = true
    snapshots.invalidate()
    frameQueue.clear()
    unsubscribeCdp()
    activeCdp.release()
    resolveDone()
  }

  const handleMessage = (method: string, params: unknown): void => {
    if (closed || (stopping && method !== 'Page.screencastFrame')) {
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
        snapshots.scheduleNavigationFrameCapture()
      }
      return
    }
    if (method === 'Page.loadEventFired') {
      snapshots.scheduleNavigationFrameCapture()
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
      frameQueue.ack(sessionId)
      return
    }
    try {
      const image = new Uint8Array(Buffer.from(data, 'base64'))
      const imageSize = readBrowserScreencastImageSize(image, options.format)
      if (!isLiveScreencastFrameCompatible(imageSize, options)) {
        // Why: Chromium can briefly stream the host surface after navigation;
        // remote clients must remain in their requested viewport space.
        frameQueue.ack(sessionId)
        snapshots.scheduleNavigationFrameCapture()
        return
      }
      snapshots.markLiveFrame()
      frameQueue.queue({
        metadata: enrichScreencastFrameMetadata(
          readScreencastFrameMetadata(payload.metadata),
          imageSize,
          options
        ),
        image,
        sessionId
      })
    } catch {
      frameQueue.ack(sessionId)
    }
  }

  const handleCdpEvent = (event: BrowserPageCdpEvent): void => {
    if (event.type === 'detached') {
      options.onError?.('Browser debugger detached while streaming.')
      finish()
      return
    }
    handleMessage(event.method, event.params)
  }
  unsubscribeCdp = activeCdp.subscribe(handleCdpEvent)

  try {
    await sendScreencastDebuggerCommand(activeCdp, 'Page.enable')
    await snapshots.applyDeviceMetricsOverride()
    await sendScreencastDebuggerCommand(activeCdp, 'Page.startScreencast', {
      format: options.format,
      quality: options.quality,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      everyNthFrame: options.everyNthFrame
    })
    snapshots.emitInitialFrame()
  } catch (error) {
    if (snapshots.hasDeviceMetricsOverride()) {
      await snapshots.clearDeviceMetricsOverride().catch(() => {})
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
      snapshots.invalidate()
      frameQueue.clear(true)
      try {
        void (async () => {
          await sendScreencastDebuggerCommand(activeCdp, 'Page.stopScreencast').catch(() => {})
          if (snapshots.hasDeviceMetricsOverride()) {
            await snapshots.clearDeviceMetricsOverride().catch(() => {})
          }
        })().finally(finish)
      } catch {
        finish()
      }
    },
    done
  }
}
