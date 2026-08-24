import { randomUUID } from 'node:crypto'

import type {
  BrowserDragResult,
  BrowserEvalResult,
  BrowserHoverResult,
  BrowserScreencastResult,
  BrowserTabCurrentResult,
  BrowserTabListResult,
  BrowserTabShowResult,
  BrowserTabSwitchResult,
  BrowserUploadResult,
  BrowserWaitResult
} from '~shared/runtime-types'
import type { BrowserCertificateProceedResult } from '~shared/types'

import { BrowserError } from '../browser/cdp-bridge'
import { startBrowserScreencast, type BrowserScreencastSession } from '../browser/screencast-stream'
import type { BrowserRemoteScreencastStartResult } from './browser-remote-screencast-authority'
import { RuntimeBrowserCommandsLayer2 } from './runtime-browser-commands-layer-2'
import type {
  BrowserScreencastParams,
  ActiveBrowserScreencastPage
} from './runtime-browser-foundation'
import {
  clampInteger,
  clampOptionalInteger,
  clampOptionalNumber
} from './runtime-browser-foundation'

export abstract class RuntimeBrowserCommandsLayer3 extends RuntimeBrowserCommandsLayer2 {
  protected async startScreencastSession(
    params: BrowserScreencastParams,
    stream: {
      sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
      emit?: (event: BrowserScreencastResult) => void
    }
  ): Promise<BrowserRemoteScreencastStartResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const { browserPageId, page } = this.resolveBrowserPage(target.worktreeId, target.browserPageId)
    let stopping = this.stoppingScreencastPageIds.get(browserPageId)
    if (stopping) {
      await stopping
    }
    let active = this.activeScreencastsByPageId.get(browserPageId)
    while (active) {
      // Why: CDP only allows one Page.startScreencast per page. Treat a new
      // subscriber as taking over from a stale/hidden paired client instead of
      // surfacing an already-active error in the browser pane.
      active.stop()
      await active.done
      stopping = this.stoppingScreencastPageIds.get(browserPageId)
      if (stopping) {
        await stopping
      }
      active = this.activeScreencastsByPageId.get(browserPageId)
    }
    this.activeScreencastPageIds.add(browserPageId)
    const format = params.format
    const subscriptionId = `browser-screencast:${browserPageId}:${randomUUID()}`
    let session: BrowserScreencastSession | null = null
    let resolveActiveDone!: () => void
    const activeDone = new Promise<void>((resolve) => {
      resolveActiveDone = resolve
    })
    let cancelledBeforeStart = false
    const activeRecord: ActiveBrowserScreencastPage = {
      stop: () => {
        if (session) {
          session.stop()
          return
        }
        cancelledBeforeStart = true
      },
      done: activeDone
    }
    this.activeScreencastsByPageId.set(browserPageId, activeRecord)
    try {
      session = await startBrowserScreencast(page, {
        format,
        quality: clampInteger(params.quality, 10, 100, 70),
        maxWidth: clampInteger(params.maxWidth, 320, 3840, 1440),
        maxHeight: clampInteger(params.maxHeight, 240, 2160, 1200),
        viewportWidth: clampOptionalInteger(params.viewportWidth, 320, 3840),
        viewportHeight: clampOptionalInteger(params.viewportHeight, 240, 2160),
        deviceScaleFactor: clampOptionalNumber(params.deviceScaleFactor, 1, 4),
        mobile: params.mobile === true,
        everyNthFrame: clampInteger(params.everyNthFrame, 1, 10, 2),
        minFrameIntervalMs: clampInteger(params.minFrameIntervalMs, 0, 1000, 0),
        onFrame: stream.sendBinary,
        onEvent: stream.emit,
        onError: (message) => stream.emit?.({ type: 'error', message })
      })
      if (cancelledBeforeStart) {
        session.stop()
        await session.done
        throw new BrowserError('browser_error', 'Browser screencast was cancelled.')
      }
    } catch (error) {
      this.activeScreencastPageIds.delete(browserPageId)
      if (this.activeScreencastsByPageId.get(browserPageId) === activeRecord) {
        this.activeScreencastsByPageId.delete(browserPageId)
      }
      resolveActiveDone()
      throw error
    }
    let stoppingPromise: Promise<void> | null = null
    const clearPageGate = (): void => {
      this.activeScreencastPageIds.delete(browserPageId)
      if (this.activeScreencastsByPageId.get(browserPageId) === activeRecord) {
        this.activeScreencastsByPageId.delete(browserPageId)
      }
      if (
        stoppingPromise &&
        this.stoppingScreencastPageIds.get(browserPageId) === stoppingPromise
      ) {
        this.stoppingScreencastPageIds.delete(browserPageId)
      }
      resolveActiveDone()
    }
    const markStopping = (): void => {
      if (stoppingPromise || !session) {
        return
      }
      // Why: mobile can unsubscribe and immediately resubscribe on rotation.
      // New streams wait for CDP teardown instead of failing with already-active.
      const completion = session.done.finally(clearPageGate)
      stoppingPromise = completion
      this.stoppingScreencastPageIds.set(browserPageId, completion)
    }
    void session.done.finally(() => {
      clearPageGate()
    })

    try {
      return {
        subscriptionId,
        session: {
          done: session.done,
          stop: () => {
            markStopping()
            session?.stop()
          }
        },
        ready: {
          type: 'ready',
          subscriptionId,
          browserPageId,
          format,
          tab: this.describeBrowserTab(browserPageId, target.worktreeId)
        }
      }
    } catch (error) {
      markStopping()
      session.stop()
      throw error
    }
  }

  async browserEval(
    params: { expression: string } & BrowserCommandTargetParams
  ): Promise<BrowserEvalResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().evaluate(
      params.expression,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserTabList(params: { worktree?: string }): Promise<BrowserTabListResult> {
    const worktreeId = await this.resolveBrowserWorktreeId(params.worktree)
    const result = this.requireAgentBrowserBridge().tabList(worktreeId)
    return {
      tabs: result.tabs.map((tab) => this.enrichBrowserTabInfo(tab))
    }
  }

  async browserProceedCertificate(
    params: { challengeId: string } & BrowserCommandTargetParams
  ): Promise<BrowserCertificateProceedResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    if (!target.browserPageId) {
      return { ok: false, reason: 'missing' }
    }
    return (
      this.shellAdapter?.browserProceedCertificate(target.browserPageId, params.challengeId) ?? {
        ok: false,
        reason: 'missing'
      }
    )
  }

  async browserTabShow(params: { page: string; worktree?: string }): Promise<BrowserTabShowResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return { tab: this.describeBrowserTab(params.page, target.worktreeId) }
  }

  async browserTabCurrent(params: { worktree?: string }): Promise<BrowserTabCurrentResult> {
    const worktreeId = await this.resolveBrowserWorktreeId(params.worktree)
    const browserPageId = this.requireAgentBrowserBridge().getActivePageId(worktreeId)
    if (!browserPageId) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }
    return { tab: this.describeBrowserTab(browserPageId, worktreeId) }
  }

  async browserTabSwitch(
    params: {
      index?: number
      focus?: boolean
    } & BrowserCommandTargetParams
  ): Promise<BrowserTabSwitchResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const bridge = this.requireAgentBrowserBridge()
    const result = await bridge.tabSwitch(params.index, target.worktreeId, target.browserPageId)
    if (params.focus) {
      // Why: prefer the explicit --worktree the caller passed; fall back to
      // the bridge's owning-worktree map for the just-switched tab. The
      // owning worktree is what the renderer needs to scope the focus to.
      // The renderer NEVER yanks the user across worktrees on this signal
      // (see focusBrowserTabInWorktree).
      const worktreeId =
        target.worktreeId ?? bridge.getWorktreeIdForTab(result.browserPageId) ?? undefined
      this.notifyRendererBrowserPaneFocus(worktreeId, result.browserPageId)
    }
    return result
  }

  async browserHover(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserHoverResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().hover(
      params.element,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserDrag(
    params: {
      from: string
      to: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserDragResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().drag(
      params.from,
      params.to,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserUpload(
    params: { element: string; files: string[] } & BrowserCommandTargetParams
  ): Promise<BrowserUploadResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.requireAgentBrowserBridge().upload(
      params.element,
      params.files,
      target.worktreeId,
      target.browserPageId
    )
  }

  async browserWait(
    params: {
      selector?: string
      timeout?: number
      text?: string
      url?: string
      load?: string
      fn?: string
      state?: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserWaitResult> {
    const target = await this.resolveBrowserCommandTarget(params)
    const { worktree: _, page: __, ...options } = params
    return this.requireAgentBrowserBridge().wait(options, target.worktreeId, target.browserPageId)
  }
}
import type { BrowserCommandTargetParams } from './runtime-browser-foundation'
