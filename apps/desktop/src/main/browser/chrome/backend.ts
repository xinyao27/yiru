import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { buildSessionStoragePersistenceScript } from '~shared/browser/session-storage-persistence'

import type { BrowserBackend, BrowserBackendCreateTab } from '../backend'
import type { BrowserPageCatalog } from '../page/catalog'
import type { BrowserCookie } from '../session'
import { ChromeBrowserPageHandle } from './page-handle'
import { type ChromeProcessOptions, type RunningChrome, startChromeProcess } from './process'

const DEFAULT_VIEWPORT_HEIGHT = 800
const DEFAULT_VIEWPORT_WIDTH = 1280

type OwnedPage = {
  handle: ChromeBrowserPageHandle
  profileKey: string
}

export type ChromeBrowserBackendOptions = ChromeProcessOptions & {
  pageCatalog: BrowserPageCatalog
  userDataParentPath: string
}

export class ChromeBrowserBackend implements BrowserBackend {
  private readonly chromeByProfileKey = new Map<string, RunningChrome>()
  private readonly chromeStartByProfileKey = new Map<string, Promise<RunningChrome>>()
  private readonly options: ChromeBrowserBackendOptions
  private readonly pagesByPageId = new Map<string, OwnedPage>()

  constructor(options: ChromeBrowserBackendOptions) {
    this.options = options
  }

  async createTab(params: BrowserBackendCreateTab): Promise<{ browserPageId: string }> {
    const browserPageId = params.browserPageId ?? randomUUID()
    const existing = this.pagesByPageId.get(browserPageId)
    if (existing && !existing.handle.isClosed()) {
      throw new Error(`Browser page already exists: ${browserPageId}`)
    }
    if (existing) {
      this.pagesByPageId.delete(browserPageId)
    }

    const profileKey = params.profileId ?? 'default'
    const chrome = await this.ensureChrome(profileKey)
    const created = await chrome.transport.send('Target.createTarget', {
      url: 'about:blank'
    })
    const targetId = readRequiredString(created, 'targetId', 'Chrome did not create a page target')

    let handle: ChromeBrowserPageHandle | null = null
    try {
      const attached = await chrome.transport.send('Target.attachToTarget', {
        targetId,
        flatten: true
      })
      const sessionId = readRequiredString(
        attached,
        'sessionId',
        'Chrome did not attach a page session'
      )
      handle = new ChromeBrowserPageHandle({
        browserPageId,
        browserVersion: chrome.browserVersion,
        onClosed: (backendPageId) => this.handlePageClosed(browserPageId, backendPageId),
        sessionId,
        shellConnectionId: params.shellConnectionId ?? null,
        targetId,
        transport: chrome.transport
      })
      await handle.initialize([buildSessionStoragePersistenceScript(browserPageId)])
      await chrome.transport.send(
        'Emulation.setDeviceMetricsOverride',
        {
          width: DEFAULT_VIEWPORT_WIDTH,
          height: DEFAULT_VIEWPORT_HEIGHT,
          deviceScaleFactor: 1,
          mobile: false
        },
        sessionId
      )
      this.options.pageCatalog.register(handle, {
        profileId: params.profileId ?? null,
        ...(params.worktreeId ? { worktreeId: params.worktreeId } : {})
      })
      this.pagesByPageId.set(browserPageId, { handle, profileKey })
      await handle.navigate(params.url || 'about:blank')
      return { browserPageId }
    } catch (error) {
      await (handle
        ? handle.closeTarget()
        : chrome.transport.send('Target.closeTarget', { targetId }).catch(() => {}))
      this.options.pageCatalog.unregister(browserPageId, `chrome-target:${targetId}`)
      throw error
    }
  }

  async closeTab(browserPageId: string): Promise<void> {
    const owned = this.pagesByPageId.get(browserPageId)
    if (!owned) {
      return
    }
    this.pagesByPageId.delete(browserPageId)
    await owned.handle.closeTarget()
    this.options.pageCatalog.unregister(browserPageId, owned.handle.identity.backendPageId)
  }

  async createProfile(profileId: string): Promise<void> {
    await mkdir(this.getProfileUserDataDirectory(profileId), { recursive: true })
  }

  async deleteProfile(profileId: string): Promise<void> {
    if (profileId === 'default') {
      return
    }
    const pageIds = [...this.pagesByPageId.entries()]
      .filter(([, owned]) => owned.profileKey === profileId)
      .map(([browserPageId]) => browserPageId)
    for (const browserPageId of pageIds) {
      await this.closeTab(browserPageId)
    }
    await this.stopProfile(profileId)
    await rm(this.getProfileUserDataDirectory(profileId), { force: true, recursive: true })
  }

  async clearProfileCookies(profileId: string | null): Promise<void> {
    const profileKey = profileId ?? 'default'
    const chrome = await this.ensureChrome(profileKey)
    await chrome.transport.send('Storage.clearCookies', {})
  }

  async setProfileCookie(profileId: string, cookie: BrowserCookie): Promise<void> {
    const chrome = await this.ensureChrome(profileId)
    const sameSite =
      cookie.sameSite === 'strict'
        ? 'Strict'
        : cookie.sameSite === 'lax'
          ? 'Lax'
          : cookie.sameSite === 'no_restriction'
            ? 'None'
            : undefined
    await chrome.transport.send('Storage.setCookies', {
      cookies: [
        {
          name: cookie.name,
          value: cookie.value,
          url: cookie.url,
          ...(!cookie.name.startsWith('__Host-') && cookie.domain ? { domain: cookie.domain } : {}),
          ...(cookie.path ? { path: cookie.path } : {}),
          ...(cookie.secure !== undefined ? { secure: cookie.secure } : {}),
          ...(cookie.httpOnly !== undefined ? { httpOnly: cookie.httpOnly } : {}),
          ...(sameSite ? { sameSite } : {}),
          ...(cookie.expirationDate !== undefined ? { expires: cookie.expirationDate } : {})
        }
      ]
    })
  }

  async setTabProfile(browserPageId: string, profileId: string | null): Promise<void> {
    const owned = this.pagesByPageId.get(browserPageId)
    if (!owned) {
      throw new Error(`Browser page was not found: ${browserPageId}`)
    }
    const url = owned.handle.getInfo().url
    const worktreeId = this.options.pageCatalog.getWorktreeIdForTab(browserPageId)
    const shellConnectionId = owned.handle.identity.shellConnectionId ?? undefined
    this.pagesByPageId.delete(browserPageId)
    try {
      await this.createTab({
        browserPageId,
        url,
        worktreeId,
        profileId: profileId ?? undefined,
        shellConnectionId
      })
    } catch (error) {
      this.pagesByPageId.set(browserPageId, owned)
      this.options.pageCatalog.register(owned.handle, {
        profileId: owned.profileKey === 'default' ? null : owned.profileKey,
        ...(worktreeId ? { worktreeId } : {})
      })
      throw error
    }
    await owned.handle.closeTarget()
  }

  async destroyAll(): Promise<void> {
    const pages = [...this.pagesByPageId.entries()]
    this.pagesByPageId.clear()
    await Promise.allSettled(
      pages.map(async ([browserPageId, owned]) => {
        await owned.handle.closeTarget()
        this.options.pageCatalog.unregister(browserPageId, owned.handle.identity.backendPageId)
      })
    )
    const profileKeys = new Set([
      ...this.chromeByProfileKey.keys(),
      ...this.chromeStartByProfileKey.keys()
    ])
    await Promise.allSettled([...profileKeys].map((profileKey) => this.stopProfile(profileKey)))
  }

  private async ensureChrome(profileKey: string): Promise<RunningChrome> {
    const current = this.chromeByProfileKey.get(profileKey)
    if (current?.transport.isConnected()) {
      return current
    }
    if (current) {
      this.chromeByProfileKey.delete(profileKey)
      this.chromeStartByProfileKey.delete(profileKey)
      const staleChrome = current
      await staleChrome.stop().catch(() => {})
    }
    let chromeStart = this.chromeStartByProfileKey.get(profileKey)
    if (!chromeStart) {
      chromeStart = startChromeProcess({
        ...this.options,
        persistentUserDataDirectory: this.getProfileUserDataDirectory(profileKey)
      })
      this.chromeStartByProfileKey.set(profileKey, chromeStart)
    }
    let startedChrome: RunningChrome | null = null
    try {
      startedChrome = await chromeStart
      const chrome = startedChrome
      this.chromeByProfileKey.set(profileKey, chrome)
      await chrome.transport.send('Target.setDiscoverTargets', { discover: true })
      return chrome
    } catch (error) {
      this.chromeStartByProfileKey.delete(profileKey)
      this.chromeByProfileKey.delete(profileKey)
      await startedChrome?.stop().catch(() => {})
      throw error
    }
  }

  private getProfileUserDataDirectory(profileKey: string): string {
    const directoryName = createHash('sha256').update(profileKey).digest('hex')
    return join(this.options.userDataParentPath, 'runtime-browser-profiles', directoryName)
  }

  private async stopProfile(profileKey: string): Promise<void> {
    const chromeStart = this.chromeStartByProfileKey.get(profileKey)
    const chrome = this.chromeByProfileKey.get(profileKey) ?? (await chromeStart?.catch(() => null))
    this.chromeByProfileKey.delete(profileKey)
    this.chromeStartByProfileKey.delete(profileKey)
    await chrome?.stop()
  }

  private handlePageClosed(browserPageId: string, backendPageId: string): void {
    const owned = this.pagesByPageId.get(browserPageId)
    if (!owned || owned.handle.identity.backendPageId !== backendPageId) {
      return
    }
    this.pagesByPageId.delete(browserPageId)
    this.options.pageCatalog.unregister(browserPageId, backendPageId)
  }
}

function readRequiredString(value: unknown, key: string, message: string): string {
  if (isRecord(value) && typeof value[key] === 'string') {
    return value[key]
  }
  throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
