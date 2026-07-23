import type { BrowserScreencastResult, RuntimeBrowserDriverState } from '../../shared/runtime-types'
import { BrowserError } from '../browser/cdp-bridge'

export type BrowserRemoteScreencastStartResult = {
  subscriptionId: string
  ready: Extract<BrowserScreencastResult, { type: 'ready' }>
  session: {
    done: Promise<void>
    stop(): void
  }
}

type ActiveRemoteBrowserScreencast = {
  cancel: (emitEnd?: boolean) => void
  done: Promise<void>
  connectionKey: string
}

type BrowserRemoteSessionHost<TParams> = {
  startScreencast(
    params: TParams,
    stream: {
      sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
      emit: (event: BrowserScreencastResult) => void
    }
  ): Promise<BrowserRemoteScreencastStartResult>
  registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void | Promise<void>,
    connectionId?: string
  ): void
  cleanupSubscription(subscriptionId: string): void
  notifyDriverChanged(browserPageId: string, driver: RuntimeBrowserDriverState): void
}

export class BrowserRemoteScreencastAuthority<TParams extends { page?: string }> {
  private readonly screencastsByConnection = new Map<string, ActiveRemoteBrowserScreencast>()
  private readonly screencastsByPage = new Map<string, ActiveRemoteBrowserScreencast>()
  private readonly driverByPageId = new Map<string, RuntimeBrowserDriverState>()
  private desktopClaimSequence = 0
  private readonly desktopClaimSequenceByPage = new Map<string, number>()

  constructor(private readonly host: BrowserRemoteSessionHost<TParams>) {}

  getDrivers(): Map<string, RuntimeBrowserDriverState> {
    return new Map(
      [...this.driverByPageId].map(([browserPageId, driver]) => [browserPageId, { ...driver }])
    )
  }

  reclaimForDesktop(browserPageId: string): boolean {
    this.desktopClaimSequenceByPage.set(browserPageId, ++this.desktopClaimSequence)
    this.setDriver(browserPageId, { kind: 'desktop' })
    this.screencastsByPage.get(browserPageId)?.cancel(true)
    return true
  }

  async screencast(
    params: TParams,
    options: {
      connectionId?: string
      sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
      signal?: AbortSignal
      emit: (result: BrowserScreencastResult) => void
    }
  ): Promise<void> {
    if (!options.sendBinary) {
      throw new BrowserError(
        'browser_error',
        'Browser screencast requires a binary streaming transport.'
      )
    }

    const desktopClaimFloor = this.desktopClaimSequence
    const connectionKey = options.connectionId ?? 'local'
    const requestedPageId = typeof params.page === 'string' ? params.page : null
    let existingPageStream = requestedPageId
      ? this.screencastsByPage.get(requestedPageId)
      : undefined
    while (existingPageStream) {
      // Why: CDP only supports one screencast per browser page. A stale paired
      // client yields ownership before the replacement resolves its viewport.
      existingPageStream.cancel(existingPageStream.connectionKey !== connectionKey)
      await existingPageStream.done
      existingPageStream = requestedPageId ? this.screencastsByPage.get(requestedPageId) : undefined
    }
    let existingConnectionStream = this.screencastsByConnection.get(connectionKey)
    while (existingConnectionStream) {
      existingConnectionStream.cancel()
      await existingConnectionStream.done
      existingConnectionStream = this.screencastsByConnection.get(connectionKey)
    }
    if (options.signal?.aborted) {
      throw new BrowserError('browser_error', 'Browser screencast was cancelled.')
    }

    let screencast: BrowserRemoteScreencastStartResult | null = null
    let registeredSubscriptionId: string | null = null
    let activeBrowserPageId: string | null = null
    let ended = false
    let cancelledBeforeStart = false
    let readyEmitted = false
    let resolveActiveDone!: () => void
    const activeDone = new Promise<void>((resolve) => {
      resolveActiveDone = resolve
    })
    const end = (emitEnd: boolean): void => {
      if (ended) {
        return
      }
      ended = true
      screencast?.session.stop()
      if (emitEnd && screencast) {
        options.emit({ type: 'end', subscriptionId: screencast.subscriptionId })
      }
    }
    const cancel = (emitEnd = false): void => {
      if (!screencast) {
        cancelledBeforeStart = true
        return
      }
      end(emitEnd)
    }
    const abortScreencast = (): void => cancel()
    const sendBinaryAfterReady = (bytes: Uint8Array<ArrayBufferLike>): boolean | void => {
      if (!readyEmitted) {
        // Why: clients learn the binary stream owner from `ready`; frames sent
        // before that event cannot be attributed to a subscription safely.
        return false
      }
      return options.sendBinary?.(bytes)
    }

    const activeRecord: ActiveRemoteBrowserScreencast = {
      cancel,
      done: activeDone,
      connectionKey
    }
    // Why: a phone can rotate before its first stream reaches `ready`. The
    // connection gate lets its replacement cancel that in-flight start.
    this.screencastsByConnection.set(connectionKey, activeRecord)
    if (requestedPageId) {
      // Why: desktop take-back can arrive while CDP startup is pending. Reserve
      // the requested page now so that reclaim cancels before mobile can commit.
      this.screencastsByPage.set(requestedPageId, activeRecord)
    }
    options.signal?.addEventListener('abort', abortScreencast, { once: true })
    try {
      screencast = await this.host.startScreencast(params, {
        sendBinary: sendBinaryAfterReady,
        emit: options.emit
      })
      if (cancelledBeforeStart || options.signal?.aborted) {
        end(false)
        await screencast.session.done
        return
      }
      activeBrowserPageId = screencast.ready.browserPageId
      if ((this.desktopClaimSequenceByPage.get(activeBrowserPageId) ?? 0) > desktopClaimFloor) {
        // Why: implicit-page starts learn their page only after awaiting CDP.
        // A take-back during that await must win over the later mobile commit.
        end(false)
        await screencast.session.done
        return
      }
      if (
        requestedPageId &&
        requestedPageId !== activeBrowserPageId &&
        this.screencastsByPage.get(requestedPageId) === activeRecord
      ) {
        this.screencastsByPage.delete(requestedPageId)
      }
      this.screencastsByPage.set(activeBrowserPageId, activeRecord)
      this.setDriver(activeBrowserPageId, { kind: 'mobile', clientId: connectionKey })

      // Why: Page.stopScreencast must follow the exact remote socket lifetime;
      // hidden panes and dropped connections otherwise leave Chromium streaming.
      this.host.registerSubscriptionCleanup(
        screencast.subscriptionId,
        () => end(true),
        options.connectionId
      )
      registeredSubscriptionId = screencast.subscriptionId
      options.emit(screencast.ready)
      readyEmitted = true
      await screencast.session.done
      end(true)
      this.host.cleanupSubscription(screencast.subscriptionId)
    } finally {
      options.signal?.removeEventListener('abort', abortScreencast)
      if (!ended) {
        end(false)
      }
      if (registeredSubscriptionId) {
        this.host.cleanupSubscription(registeredSubscriptionId)
      }
      if (this.screencastsByConnection.get(connectionKey) === activeRecord) {
        this.screencastsByConnection.delete(connectionKey)
      }
      if (activeBrowserPageId) {
        if (this.screencastsByPage.get(activeBrowserPageId) === activeRecord) {
          this.screencastsByPage.delete(activeBrowserPageId)
        }
        const driver = this.getDriver(activeBrowserPageId)
        if (driver.kind === 'mobile' && driver.clientId === connectionKey) {
          this.setDriver(activeBrowserPageId, { kind: 'idle' })
        }
      }
      if (
        requestedPageId &&
        requestedPageId !== activeBrowserPageId &&
        this.screencastsByPage.get(requestedPageId) === activeRecord
      ) {
        this.screencastsByPage.delete(requestedPageId)
      }
      resolveActiveDone()
    }
  }

  private getDriver(browserPageId: string): RuntimeBrowserDriverState {
    return this.driverByPageId.get(browserPageId) ?? { kind: 'idle' }
  }

  private setDriver(browserPageId: string, next: RuntimeBrowserDriverState): void {
    const previous = this.getDriver(browserPageId)
    if (previous.kind === next.kind) {
      if (
        previous.kind === 'mobile' &&
        next.kind === 'mobile' &&
        previous.clientId === next.clientId
      ) {
        return
      }
      if (previous.kind !== 'mobile' && next.kind !== 'mobile') {
        return
      }
    }
    if (next.kind === 'idle') {
      this.driverByPageId.delete(browserPageId)
    } else {
      this.driverByPageId.set(browserPageId, next)
    }
    this.host.notifyDriverChanged(browserPageId, next)
  }
}
