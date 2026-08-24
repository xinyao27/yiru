import type { BrowserScreencastFrameMetadata } from '~shared/browser/screencast-protocol'

import type { BrowserScreencastOptions, ScreencastImageSize } from './screencast-types'

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readScreencastFrameMetadata(raw: unknown): BrowserScreencastFrameMetadata {
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
): ScreencastImageSize {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function isNearSize(actual: ScreencastImageSize, expected: ScreencastImageSize): boolean {
  return isNear(actual.width, expected.width) && isNear(actual.height, expected.height)
}

function selectFrameDeviceSize(
  reportedSize: number | undefined,
  requestedCssSize: number | null,
  imageSize: number | undefined
): number | undefined {
  // Why: paired clients own the viewport; a transient host BrowserView size
  // must not make the remote compensate with crop/contain math.
  if (requestedCssSize) {
    return requestedCssSize
  }
  return reportedSize ?? imageSize
}

export function isLiveScreencastFrameCompatible(
  imageSize: ScreencastImageSize | null,
  options: BrowserScreencastOptions
): boolean {
  const viewportWidth = positiveInteger(options.viewportWidth)
  const viewportHeight = positiveInteger(options.viewportHeight)
  if (!viewportWidth || !viewportHeight || !imageSize) {
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
  // Why: Chromium may stream CSS-, DPR-, or max-size-scaled bitmaps. Only a
  // stale host-surface frame is incompatible.
  return (
    isNearSize(imageSize, cssViewport) ||
    isNearSize(imageSize, deviceViewport) ||
    isNearSize(imageSize, scaledDeviceViewport)
  )
}

export function enrichScreencastFrameMetadata(
  metadata: BrowserScreencastFrameMetadata,
  imageSize: ScreencastImageSize | null,
  options: BrowserScreencastOptions
): BrowserScreencastFrameMetadata {
  const enriched: BrowserScreencastFrameMetadata = { ...metadata }
  const deviceWidth = selectFrameDeviceSize(
    enriched.deviceWidth,
    positiveInteger(options.viewportWidth),
    imageSize?.width
  )
  const deviceHeight = selectFrameDeviceSize(
    enriched.deviceHeight,
    positiveInteger(options.viewportHeight),
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

export function positiveInteger(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

export function positiveNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}
