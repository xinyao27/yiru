import { randomUUID } from 'node:crypto'

import type { BrowserDownloadFinishedEvent } from '~shared/browser/guest-events'

import { browserDownloadDestinationReservations } from './download-destination'
import {
  type ActiveDownload,
  type BrowserDownloadDoneState,
  safeOrigin
} from './manager-foundation'
import { BrowserManagerOffscreen } from './manager-offscreen'
import type { BrowserDownloadItem } from './session'

export abstract class BrowserManagerDownloads extends BrowserManagerOffscreen {
  notifyPermissionDenied(args: {
    guestWebContentsId: number
    permission: string
    rawUrl: string
  }): void {
    this.forwardOrQueuePermissionDenied(args.guestWebContentsId, {
      permission: args.permission,
      origin: safeOrigin(args.rawUrl)
    })
  }

  handleGuestWillDownload(args: { guestWebContentsId: number; item: BrowserDownloadItem }): void {
    const { guestWebContentsId, item } = args
    const downloadId = randomUUID()
    const requestedFilename = (() => {
      try {
        return item.getFilename() || 'download'
      } catch {
        return 'download'
      }
    })()
    const totalBytes = (() => {
      try {
        const total = item.getTotalBytes()
        return total > 0 ? total : null
      } catch {
        return null
      }
    })()
    const mimeType = (() => {
      try {
        const mime = item.getMimeType()
        return mime || null
      } catch {
        return null
      }
    })()
    const origin = (() => {
      try {
        return safeOrigin(item.getUrl())
      } catch {
        return 'unknown'
      }
    })()

    const destination = (() => {
      try {
        return browserDownloadDestinationReservations.reserve(requestedFilename)
      } catch (error) {
        console.error('[browser-download] Failed to choose download destination:', error)
        return null
      }
    })()

    const fallbackSavePath = destination?.savePath ?? ''

    const download: ActiveDownload = {
      downloadId,
      guestWebContentsId,
      browserTabId: null,
      rendererWebContentsId: null,
      origin,
      filename: destination?.filename ?? requestedFilename,
      totalBytes,
      mimeType,
      item,
      savePath: fallbackSavePath,
      reservationKey: destination?.reservationKey ?? null,
      receivedBytes: 0,
      transientState: null,
      terminalEvent: null,
      startedSent: false,
      cleanup: null
    }
    this.downloadsById.set(downloadId, download)

    const browserTabId = this.resolveBrowserTabIdForGuestWebContentsId(guestWebContentsId)
    if (browserTabId) {
      this.bindDownloadToTab(downloadId, browserTabId)
    } else {
      const pending = this.pendingDownloadIdsByGuestId.get(guestWebContentsId) ?? []
      pending.push(downloadId)
      this.pendingDownloadIdsByGuestId.set(guestWebContentsId, pending)
    }

    if (!destination) {
      this.finishDownloadInternal(downloadId, 'failed', 'Could not choose a Downloads file name.')
      try {
        item.cancel()
      } catch {
        // Why: without a destination, Chromium must not keep writing invisibly;
        // cancellation remains best-effort after surfacing the failure.
      }
      return
    }

    try {
      item.setSavePath(destination.savePath)
    } catch (error) {
      console.error('[browser-download] Failed to set download destination:', error)
      this.finishDownloadInternal(downloadId, 'failed', 'Failed to set download destination.')
      try {
        item.cancel()
      } catch {
        // Why: failing setSavePath can leave Electron in a partially finalized
        // state; cancellation is best-effort after Yiru has made the UI terminal.
      }
      return
    }

    const updatedHandler = (state: 'progressing' | 'interrupted'): void => {
      download.receivedBytes = this.getDownloadReceivedBytes(download.item)
      download.transientState = state
      this.sendDownloadProgress(download.browserTabId, {
        browserPageId: download.browserTabId ?? undefined,
        downloadId: download.downloadId,
        receivedBytes: download.receivedBytes,
        totalBytes: download.totalBytes,
        state
      })
    }
    const doneHandler = (state: BrowserDownloadDoneState): void => {
      const status: BrowserDownloadFinishedEvent['status'] =
        state === 'completed' ? 'completed' : state === 'cancelled' ? 'canceled' : 'failed'
      this.finishDownloadInternal(
        download.downloadId,
        status,
        status === 'failed'
          ? state === 'interrupted'
            ? 'Download was interrupted.'
            : 'Download failed.'
          : null
      )
    }
    download.cleanup = (): void => {
      try {
        download.item.offUpdated(updatedHandler)
        download.item.offDone(doneHandler)
      } catch {
        // Why: completed DownloadItems can already be finalized when cleanup
        // runs. Cleanup must stay best-effort so UI teardown never crashes main.
      }
    }
    item.onUpdated(updatedHandler)
    item.onceDone(doneHandler)

    if (browserTabId) {
      this.sendDownloadStarted(downloadId)
    }
  }

  cancelDownload(args: { downloadId: string; shellConnectionId: string }): boolean {
    const download = this.downloadsById.get(args.downloadId)
    const pageShellConnectionId = download?.browserTabId
      ? this.pageRegistry.get(download.browserTabId)?.identity.shellConnectionId
      : null
    if (!download || pageShellConnectionId !== args.shellConnectionId) {
      return false
    }
    this.cancelDownloadInternal(args.downloadId, 'Canceled.')
    return true
  }

  // Why: guest browser surfaces are isolated from Yiru's bootstrap preload, so
  // the registered page handle owns the optional backend devtools escape hatch.
}
