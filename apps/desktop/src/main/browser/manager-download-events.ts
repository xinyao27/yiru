import type {
  BrowserDownloadFinishedEvent,
  BrowserDownloadProgressEvent
} from '~shared/browser/guest-events'
import { normalizeBrowserNavigationUrl, redactKagiSessionToken } from '~shared/browser/url'
import { YIRU_BROWSER_BLANK_URL } from '~shared/constants'

import { browserDownloadDestinationReservations } from './download-destination'
import { BrowserManagerEvents } from './manager-events'
import type { BrowserDownloadItem } from './session'

export class BrowserManager extends BrowserManagerEvents {
  protected bindDownloadToTab(downloadId: string, browserTabId: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download) {
      return
    }
    download.browserTabId = browserTabId
    download.rendererWebContentsId = this.rendererWebContentsIdByTabId.get(browserTabId) ?? null
  }

  protected flushPendingDownloadRequests(browserTabId: string, guestWebContentsId: number): void {
    const pending = this.pendingDownloadIdsByGuestId.get(guestWebContentsId)
    if (!pending?.length) {
      return
    }
    this.pendingDownloadIdsByGuestId.delete(guestWebContentsId)
    for (const downloadId of pending) {
      this.bindDownloadToTab(downloadId, browserTabId)
      this.flushDownloadSnapshot(downloadId)
    }
  }

  protected flushDownloadSnapshot(downloadId: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download) {
      return
    }
    this.sendDownloadStarted(downloadId)
    if (download.receivedBytes > 0 || download.transientState) {
      this.sendDownloadProgress(download.browserTabId, {
        browserPageId: download.browserTabId ?? undefined,
        downloadId: download.downloadId,
        receivedBytes: download.receivedBytes,
        totalBytes: download.totalBytes,
        state: download.transientState
      })
    }
    if (download.terminalEvent) {
      this.sendDownloadFinished(download.browserTabId, {
        ...download.terminalEvent,
        browserPageId: download.browserTabId ?? undefined
      })
      this.downloadsById.delete(downloadId)
    }
  }

  protected sendDownloadStarted(downloadId: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download?.browserTabId) {
      return
    }
    if (download.startedSent) {
      return
    }
    this.publishGuestEvent({
      type: 'downloadRequested',
      browserPageId: download.browserTabId,
      downloadId: download.downloadId,
      origin: download.origin,
      filename: download.filename,
      totalBytes: download.totalBytes,
      mimeType: download.mimeType,
      savePath: download.savePath,
      status: 'downloading'
    })
    download.startedSent = true
  }

  protected sendDownloadProgress(
    browserTabId: string | null,
    payload: BrowserDownloadProgressEvent
  ): void {
    if (!browserTabId) {
      return
    }
    this.publishGuestEvent({ type: 'downloadProgress', ...payload })
  }

  protected sendDownloadFinished(
    browserTabId: string | null,
    payload: BrowserDownloadFinishedEvent
  ): void {
    if (!browserTabId) {
      return
    }
    this.publishGuestEvent({ type: 'downloadFinished', ...payload })
  }

  protected cancelDownloadInternal(downloadId: string, reason: string): void {
    const download = this.downloadsById.get(downloadId)
    if (!download) {
      return
    }

    if (download.cleanup) {
      download.cleanup()
      download.cleanup = null
    }
    const shouldSendCancel = !download.terminalEvent

    try {
      download.item.cancel()
    } catch {
      // Why: DownloadItem.cancel can throw after the item has already
      // finalized. Cleanup here is best-effort because the UI state is the
      // source of truth for whether Yiru still considers the request active.
    }

    if (shouldSendCancel) {
      this.finishDownloadInternal(downloadId, 'canceled', reason || null)
      return
    }

    this.downloadsById.delete(downloadId)
  }

  protected finishDownloadInternal(
    downloadId: string,
    status: BrowserDownloadFinishedEvent['status'],
    error: string | null
  ): void {
    const download = this.downloadsById.get(downloadId)
    if (!download || download.terminalEvent) {
      return
    }

    if (download.cleanup) {
      download.cleanup()
      download.cleanup = null
    }
    browserDownloadDestinationReservations.release(download.reservationKey)
    download.reservationKey = null
    const event: BrowserDownloadFinishedEvent = {
      browserPageId: download.browserTabId ?? undefined,
      downloadId: download.downloadId,
      status,
      savePath: download.savePath || null,
      error
    }
    download.terminalEvent = event
    if (download.browserTabId) {
      this.sendDownloadStarted(downloadId)
      this.sendDownloadFinished(download.browserTabId, event)
      this.downloadsById.delete(downloadId)
    }
  }

  protected cancelPendingDownloadsForGuest(guestWebContentsId: number): void {
    const pending = this.pendingDownloadIdsByGuestId.get(guestWebContentsId)
    this.pendingDownloadIdsByGuestId.delete(guestWebContentsId)
    if (!pending?.length) {
      return
    }
    for (const downloadId of pending) {
      const download = this.downloadsById.get(downloadId)
      if (!download) {
        continue
      }
      if (download.terminalEvent) {
        this.downloadsById.delete(downloadId)
        continue
      }
      this.cancelDownloadInternal(downloadId, 'Browser page closed before download could be shown.')
      const afterCancel = this.downloadsById.get(downloadId)
      if (afterCancel?.terminalEvent && !afterCancel.browserTabId) {
        this.downloadsById.delete(downloadId)
      }
    }
  }

  protected getDownloadReceivedBytes(item: BrowserDownloadItem): number {
    try {
      return Math.max(0, item.getReceivedBytes())
    } catch {
      return 0
    }
  }

  protected flushPendingLoadFailure(browserTabId: string, guestWebContentsId: number): void {
    const pending = this.pendingLoadFailuresByGuestId.get(guestWebContentsId)
    if (!pending) {
      return
    }
    this.pendingLoadFailuresByGuestId.delete(guestWebContentsId)
    this.sendGuestLoadFailure(browserTabId, pending)
  }

  protected sendGuestLoadFailure(
    browserTabId: string,
    loadError: { code: number; description: string; validatedUrl: string }
  ): void {
    this.publishGuestEvent({
      type: 'guestLoadFailed',
      browserPageId: browserTabId,
      loadError: { ...loadError, validatedUrl: redactKagiSessionToken(loadError.validatedUrl) }
    })
  }

  protected forwardClickedLink(browserTabId: string, rawUrl: string): void {
    const normalizedUrl = normalizeBrowserNavigationUrl(rawUrl)
    if (!normalizedUrl || normalizedUrl === YIRU_BROWSER_BLANK_URL) {
      return
    }
    // Why: the renderer owns both the saved link destination and Yiru's tab
    // model. Main forwards only a validated URL and never creates a blank popup.
    this.publishGuestEvent({
      type: 'openLinkInYiruTab',
      browserPageId: browserTabId,
      url: normalizedUrl
    })
  }
}
