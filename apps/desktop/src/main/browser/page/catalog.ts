import type { BrowserCertificateFailure, BrowserLoadError } from '~shared/types'

import type { BrowserPageHandle } from './handle'
import { BrowserPageRegistry } from './registry'

export type BrowserPageRegistrationMetadata = {
  profileId: string | null
  worktreeId?: string
}

export type BrowserPageProvider = {
  acquireAutomationVisibility(browserPageId: string): Promise<() => void>
  getBrowserPageCertificateFailure(browserPageId: string): BrowserCertificateFailure | null
  getBrowserPageLoadError(browserPageId: string): BrowserLoadError | null
  getPage(browserPageId: string): BrowserPageHandle | null
  getPages(): BrowserPageHandle[]
  getSessionProfileIdForTab(browserPageId: string): string | null
  getWorktreeIdForTab(browserPageId: string): string | undefined
  unregisterPage(browserPageId: string): void
}

type BrowserPageCatalogEntry = BrowserPageRegistrationMetadata & {
  backendPageId: string
  loadError: BrowserLoadError | null
  unsubscribe: () => void
}

export class BrowserPageCatalog implements BrowserPageProvider {
  private readonly entriesByPageId = new Map<string, BrowserPageCatalogEntry>()
  private readonly onPageClosed: (browserPageId: string) => void
  private readonly registry: BrowserPageRegistry

  constructor(onPageClosed: (browserPageId: string) => void = () => {}) {
    this.onPageClosed = onPageClosed
    this.registry = new BrowserPageRegistry()
  }

  register(handle: BrowserPageHandle, metadata: BrowserPageRegistrationMetadata): void {
    this.registry.register(handle)
    const browserPageId = handle.identity.browserPageId
    this.entriesByPageId.get(browserPageId)?.unsubscribe()
    const entry: BrowserPageCatalogEntry = {
      ...metadata,
      backendPageId: handle.identity.backendPageId,
      loadError: null,
      unsubscribe: () => {}
    }
    this.entriesByPageId.set(browserPageId, entry)
    entry.unsubscribe = handle.subscribe((event) => {
      if (this.entriesByPageId.get(browserPageId) !== entry) {
        return
      }
      switch (event.type) {
        case 'closed':
          this.onPageClosed(browserPageId)
          this.removeEntry(browserPageId, entry)
          break
        case 'load-finished':
          entry.loadError = null
          break
        case 'load-failed':
          entry.loadError = {
            code: event.errorCode,
            description: event.errorDescription,
            validatedUrl: event.validatedUrl
          }
          break
      }
    })
  }

  unregister(browserPageId: string, expectedBackendPageId?: string): BrowserPageHandle | null {
    const current = this.registry.get(browserPageId)
    if (
      current &&
      expectedBackendPageId !== undefined &&
      current.identity.backendPageId !== expectedBackendPageId
    ) {
      return null
    }
    const handle = this.registry.unregister(browserPageId, expectedBackendPageId)
    if (handle || !current) {
      const entry = this.entriesByPageId.get(browserPageId)
      if (
        !entry ||
        expectedBackendPageId === undefined ||
        entry.backendPageId === expectedBackendPageId
      ) {
        this.removeEntry(browserPageId, entry)
      }
    }
    return handle
  }

  unregisterPage(browserPageId: string): void {
    this.unregister(browserPageId)
  }

  getPage(browserPageId: string): BrowserPageHandle | null {
    return this.registry.get(browserPageId)
  }

  getPages(): BrowserPageHandle[] {
    return this.registry.list()
  }

  getWorktreeIdForTab(browserPageId: string): string | undefined {
    return this.entriesByPageId.get(browserPageId)?.worktreeId
  }

  getSessionProfileIdForTab(browserPageId: string): string | null {
    return this.entriesByPageId.get(browserPageId)?.profileId ?? null
  }

  getBrowserPageLoadError(browserPageId: string): BrowserLoadError | null {
    return this.entriesByPageId.get(browserPageId)?.loadError ?? null
  }

  getBrowserPageCertificateFailure(_browserPageId: string): BrowserCertificateFailure | null {
    // Why: Chrome owns its certificate interstitial; the Electron trust adapter is not portable.
    return null
  }

  async acquireAutomationVisibility(_browserPageId: string): Promise<() => void> {
    // Why: headless Chrome targets remain paintable without a renderer visibility lease.
    return () => {}
  }

  clear(): void {
    for (const entry of this.entriesByPageId.values()) {
      entry.unsubscribe()
    }
    this.registry.clear()
    this.entriesByPageId.clear()
  }

  private removeEntry(browserPageId: string, entry?: BrowserPageCatalogEntry): void {
    if (!entry || this.entriesByPageId.get(browserPageId) !== entry) {
      return
    }
    entry.unsubscribe()
    this.entriesByPageId.delete(browserPageId)
  }
}
