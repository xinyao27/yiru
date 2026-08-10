import type { BrowserPageCdpLease, BrowserPageHandle } from './page/handle'

const SCREENSHOT_TIMEOUT_MS = 8_000
const FALLBACK_CAPTURE_TIMEOUT_MS = 1_000
const SCREENSHOT_TIMEOUT_MESSAGE =
  'Screenshot timed out — the browser tab may not be visible or the window may not have focus.'

function getLayoutClip(metrics: {
  cssContentSize?: { width?: number; height?: number }
  contentSize?: { width?: number; height?: number }
}): { x: number; y: number; width: number; height: number; scale: number } | null {
  // Why: CDP clip coordinates are CSS pixels. Chromium contentSize can expose
  // device pixels on HiDPI guests, producing a tiled image.
  const size = metrics.cssContentSize ?? metrics.contentSize
  const width = size?.width
  const height = size?.height
  if (
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return null
  }
  return { x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height), scale: 1 }
}

async function sendCommandWithTimeout(
  cdp: BrowserPageCdpLease,
  method: string,
  params: Record<string, unknown> | undefined,
  timeoutMessage: string
): Promise<unknown> {
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      cdp.sendCommand(method, params),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), SCREENSHOT_TIMEOUT_MS)
      })
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export async function captureFullPageScreenshot(
  page: BrowserPageHandle,
  format: 'png' | 'jpeg' = 'png'
): Promise<{ data: string; format: 'png' | 'jpeg' }> {
  if (page.isClosed()) {
    throw new Error('Browser tab is no longer available')
  }
  const cdp = page.acquireCdp()
  try {
    page.prepareForCapture()
    const rawMetrics = await sendCommandWithTimeout(
      cdp,
      'Page.getLayoutMetrics',
      undefined,
      SCREENSHOT_TIMEOUT_MESSAGE
    )
    const metrics =
      rawMetrics && typeof rawMetrics === 'object'
        ? (rawMetrics as {
            cssContentSize?: { width?: number; height?: number }
            contentSize?: { width?: number; height?: number }
          })
        : {}
    const clip = getLayoutClip(metrics)
    if (!clip) {
      throw new Error('Unable to determine full-page screenshot bounds')
    }
    const rawResult = await sendCommandWithTimeout(
      cdp,
      'Page.captureScreenshot',
      { format, captureBeyondViewport: true, clip },
      SCREENSHOT_TIMEOUT_MESSAGE
    )
    const result =
      rawResult && typeof rawResult === 'object' ? (rawResult as Record<string, unknown>) : {}
    if (typeof result.data !== 'string') {
      throw new Error('Screenshot returned no image data')
    }
    return { data: result.data, format }
  } finally {
    cdp.release()
  }
}

// Why: Electron webview CDP capture can stall when its compositor is parked.
// The optional fallback is implemented by the Electron handle; Node Chrome
// handles omit it and remain on the portable CDP path.
export function captureScreenshot(
  page: BrowserPageHandle,
  cdp: BrowserPageCdpLease,
  params: Record<string, unknown> | undefined,
  onResult: (result: unknown) => void,
  onError: (message: string) => void
): void {
  if (page.isClosed() || !cdp.isConnected()) {
    onError('Browser debugger is no longer attached')
    return
  }
  const screenshotParams = selectScreenshotParams(params)
  let settled = false
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  const clearTimers = (): void => {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
    }
    timeoutTimer = null
    fallbackTimer = null
  }
  const settleResult = (result: unknown): void => {
    if (settled) {
      return
    }
    settled = true
    clearTimers()
    onResult(result)
  }
  const settleError = (message: string): void => {
    if (settled) {
      return
    }
    settled = true
    clearTimers()
    onError(message)
  }

  try {
    page.prepareForCapture()
  } catch {
    // A teardown race can reject repaint while CDP still has a useful response.
  }
  timeoutTimer = setTimeout(() => {
    const captureFallback = page.captureCompositorFrame
    if (!captureFallback) {
      settleError(SCREENSHOT_TIMEOUT_MESSAGE)
      return
    }
    fallbackTimer = setTimeout(
      () => settleError(SCREENSHOT_TIMEOUT_MESSAGE),
      FALLBACK_CAPTURE_TIMEOUT_MS
    )
    void captureFallback(params ?? {}).then(
      (fallback) => (fallback ? settleResult(fallback) : settleError(SCREENSHOT_TIMEOUT_MESSAGE)),
      () => settleError(SCREENSHOT_TIMEOUT_MESSAGE)
    )
  }, SCREENSHOT_TIMEOUT_MS)

  void cdp
    .sendCommand('Page.captureScreenshot', screenshotParams)
    .then(settleResult, (error: unknown) =>
      settleError(error instanceof Error ? error.message : String(error))
    )
}

function selectScreenshotParams(
  params: Record<string, unknown> | undefined
): Record<string, unknown> {
  const selected: Record<string, unknown> = {}
  for (const key of ['format', 'quality', 'clip', 'captureBeyondViewport', 'fromSurface']) {
    if (params?.[key] !== undefined) {
      selected[key] = params[key]
    }
  }
  return selected
}
