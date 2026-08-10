import { webContents, type NativeImage, type WebContents } from 'electron'

import type { BrowserPrintToPdfOptions } from '../cdp-print-to-pdf'
import { acquireElectronDebugger } from '../electron-debugger-lease'
import type {
  BrowserPageBackendKind,
  BrowserPageEvent,
  BrowserPageHandle,
  BrowserPageIdentity
} from './handle'

export type ElectronBrowserPageHandleOptions = {
  browserPageId: string
  backendKind: Extract<BrowserPageBackendKind, 'electron-webview' | 'electron-offscreen'>
  rendererOwnerId: string | null
  shellConnectionId: string | null
  webContents: WebContents
}

export function electronBrowserBackendPageId(webContentsId: number): string {
  return `electron-webcontents:${webContentsId}`
}

export function electronBrowserWebContentsId(backendPageId: string): number | null {
  const prefix = 'electron-webcontents:'
  if (!backendPageId.startsWith(prefix)) {
    return null
  }
  const webContentsId = Number(backendPageId.slice(prefix.length))
  if (!Number.isInteger(webContentsId) || webContentsId <= 0) {
    return null
  }
  return webContentsId
}

export function resolveElectronBrowserWebContents(backendPageId: string): WebContents | null {
  const webContentsId = electronBrowserWebContentsId(backendPageId)
  if (webContentsId === null) {
    return null
  }
  const page = webContents.fromId(webContentsId)
  return page && !page.isDestroyed() ? page : null
}

function applyFallbackClip(
  image: NativeImage,
  params: Record<string, unknown>
): NativeImage | null {
  if (params.captureBeyondViewport) {
    // Why: Electron can only capture the painted viewport. Returning it for a
    // beyond-viewport request would silently misrepresent the captured area.
    return null
  }

  const clip = params.clip
  if (!clip || typeof clip !== 'object') {
    return image
  }
  const clipRect = clip as Record<string, unknown>
  const x = typeof clipRect.x === 'number' ? clipRect.x : Number.NaN
  const y = typeof clipRect.y === 'number' ? clipRect.y : Number.NaN
  const width = typeof clipRect.width === 'number' ? clipRect.width : Number.NaN
  const height = typeof clipRect.height === 'number' ? clipRect.height : Number.NaN
  const scale =
    typeof clipRect.scale === 'number' && Number.isFinite(clipRect.scale) && clipRect.scale > 0
      ? clipRect.scale
      : 1
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null
  }

  const cropRect = {
    x: Math.round(x * scale),
    y: Math.round(y * scale),
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  }
  const imageSize = image.getSize()
  if (
    cropRect.x < 0 ||
    cropRect.y < 0 ||
    cropRect.width <= 0 ||
    cropRect.height <= 0 ||
    cropRect.x + cropRect.width > imageSize.width ||
    cropRect.y + cropRect.height > imageSize.height
  ) {
    return null
  }
  return image.crop(cropRect)
}

function encodeCompositorFrame(
  image: NativeImage,
  params: Record<string, unknown>
): { data: string } | null {
  if (image.isEmpty()) {
    return null
  }
  const clippedImage = applyFallbackClip(image, params)
  if (!clippedImage || clippedImage.isEmpty()) {
    return null
  }
  const format = params.format === 'jpeg' ? 'jpeg' : 'png'
  const quality =
    typeof params.quality === 'number' && Number.isFinite(params.quality)
      ? Math.max(0, Math.min(100, Math.round(params.quality)))
      : 90
  const buffer = format === 'jpeg' ? clippedImage.toJPEG(quality) : clippedImage.toPNG()
  return { data: buffer.toString('base64') }
}

export function createElectronBrowserPageHandle(
  options: ElectronBrowserPageHandleOptions
): BrowserPageHandle {
  const page = options.webContents
  const identity: BrowserPageIdentity = {
    browserPageId: options.browserPageId,
    backendPageId: electronBrowserBackendPageId(page.id),
    backendKind: options.backendKind,
    rendererOwnerId: options.rendererOwnerId,
    shellConnectionId: options.shellConnectionId
  }

  return {
    identity,
    isClosed: () => page.isDestroyed(),
    getInfo: () => ({
      title: page.isDestroyed() ? '' : page.getTitle(),
      url: page.isDestroyed() ? '' : page.getURL(),
      browserVersion: process.versions.chrome ?? '134.0.0.0'
    }),
    getUserAgent: () => (page.isDestroyed() ? '' : page.getUserAgent()),
    subscribe: (listener) => subscribeToElectronPage(page, listener),
    acquireCdp: () => acquireElectronDebugger(page),
    focus: async () => {
      if (page.isDestroyed()) {
        throw new Error('Browser tab is no longer available')
      }
      page.focus()
    },
    reload: async (reloadOptions) => {
      if (page.isDestroyed()) {
        throw new Error('Browser tab is no longer available')
      }
      if (reloadOptions?.ignoreCache) {
        page.reloadIgnoringCache()
      } else {
        page.reload()
      }
    },
    printToPdf: async (printOptions: BrowserPrintToPdfOptions) => {
      if (page.isDestroyed()) {
        throw new Error('Browser tab is no longer available')
      }
      return new Uint8Array(await page.printToPDF(printOptions))
    },
    prepareForCapture: () => {
      if (!page.isDestroyed()) {
        try {
          page.invalidate()
        } catch {
          // Why: teardown can reject repaint while an already-issued CDP capture settles.
        }
      }
    },
    openDevTools: () => {
      if (!page.isDestroyed()) {
        page.openDevTools({ mode: 'detach' })
      }
    },
    captureCompositorFrame: async (params) => {
      if (page.isDestroyed()) {
        return null
      }
      const image = await page.capturePage()
      return encodeCompositorFrame(image, params)
    }
  }
}

function subscribeToElectronPage(
  page: WebContents,
  listener: (event: BrowserPageEvent) => void
): () => void {
  const onClosed = (): void => listener({ type: 'closed' })
  const onLoadFinished = (): void => listener({ type: 'load-finished' })
  const onLoadFailed = (
    _event: unknown,
    errorCode: number,
    errorDescription: string,
    validatedUrl: string,
    isMainFrame: boolean
  ): void => {
    if (isMainFrame) {
      listener({ type: 'load-failed', errorCode, errorDescription, validatedUrl })
    }
  }
  page.on('destroyed', onClosed)
  page.on('did-finish-load', onLoadFinished)
  page.on('did-fail-load', onLoadFailed)
  return () => {
    page.removeListener('destroyed', onClosed)
    page.removeListener('did-finish-load', onLoadFinished)
    page.removeListener('did-fail-load', onLoadFailed)
  }
}
