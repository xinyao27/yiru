import type { BrowserScreencastResult } from '~shared/runtime-types'

import {
  BrowserRemoteScreencastAuthority,
  type BrowserRemoteScreencastStartResult
} from './browser-remote-screencast-authority'
import type {
  RuntimeBrowserCommandHost,
  RuntimeBrowserShellAdapter
} from './runtime-browser-command-host'
import type {
  BrowserScreencastParams,
  ActiveBrowserScreencastPage
} from './runtime-browser-foundation'

export abstract class RuntimeBrowserCommandsBase {
  protected readonly activeScreencastPageIds = new Set<string>()
  protected readonly activeScreencastsByPageId = new Map<string, ActiveBrowserScreencastPage>()
  protected readonly stoppingScreencastPageIds = new Map<string, Promise<void>>()
  protected readonly navigationUpdateGenerations = new Map<string, number>()
  protected readonly remoteScreencasts: BrowserRemoteScreencastAuthority<BrowserScreencastParams>
  protected readonly host: RuntimeBrowserCommandHost
  protected readonly shellAdapter: RuntimeBrowserShellAdapter | null

  constructor(
    host: RuntimeBrowserCommandHost,
    shellAdapter: RuntimeBrowserShellAdapter | null = null
  ) {
    this.host = host
    this.shellAdapter = shellAdapter
    this.remoteScreencasts = new BrowserRemoteScreencastAuthority({
      startScreencast: (params, stream) => this.startScreencastSession(params, stream),
      registerSubscriptionCleanup: (subscriptionId, cleanup, connectionId) =>
        this.host.registerSubscriptionCleanup(subscriptionId, cleanup, connectionId),
      cleanupSubscription: (subscriptionId) => this.host.cleanupSubscription(subscriptionId),
      notifyDriverChanged: (browserPageId, driver) =>
        this.host.notifyBrowserDriverChanged(browserPageId, driver)
    })
  }

  protected abstract startScreencastSession(
    params: BrowserScreencastParams,
    stream: {
      sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
      emit?: (event: BrowserScreencastResult) => void
    }
  ): Promise<BrowserRemoteScreencastStartResult>
}
