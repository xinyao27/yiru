import { existsSync, readFileSync } from 'node:fs'

import type { BrowserReloadResult, BrowserScreenshotResult } from '~shared/runtime-types'

import { AgentBrowserBridgeStorage } from './agent-browser-bridge-storage'
import { BrowserError } from './cdp-bridge'
import { captureFullPageScreenshot } from './cdp-screenshot'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeScreenshot extends AgentBrowserBridgeStorage {
  async reload(worktreeId?: string, browserPageId?: string): Promise<BrowserReloadResult> {
    // Why: reload can trigger a process swap in Electron (site-isolation), which
    // destroys the agent-browser session mid-command. Use the stable page handle
    // instead of going through agent-browser to avoid that session lifecycle issue.
    // Routed through enqueueCommand so it serializes with other in-flight commands.
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (_sessionName, target) => {
      const page = this.browserPages.getPage(target.browserPageId)
      if (!page) {
        throw new BrowserError('browser_no_tab', 'Tab is no longer available')
      }
      let cancelLoadWait = (): void => {}
      const loadOutcome = new Promise<'loaded' | 'closed' | 'timeout'>((resolve) => {
        let settled = false
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null
        let unsubscribe = (): void => {}

        const finish = (outcome: 'loaded' | 'closed' | 'timeout'): void => {
          if (settled) {
            return
          }
          settled = true
          unsubscribe()
          if (fallbackTimer) {
            clearTimeout(fallbackTimer)
            fallbackTimer = null
          }
          resolve(outcome)
        }
        unsubscribe = page.subscribe((event) => {
          if (event.type === 'load-finished' || event.type === 'load-failed') {
            finish('loaded')
          } else if (event.type === 'closed') {
            finish('closed')
          }
        })
        // Why: successful reloads must clear the fallback timer; otherwise each
        // reload retains the page handle and listeners until the 10s timeout fires.
        fallbackTimer = setTimeout(() => finish('timeout'), 10_000)
        if (typeof fallbackTimer.unref === 'function') {
          fallbackTimer.unref()
        }
        cancelLoadWait = () => finish('timeout')
      })
      try {
        await page.reload()
      } catch (error) {
        cancelLoadWait()
        throw error
      }
      const outcome = await loadOutcome
      const currentPage =
        outcome === 'closed' || page.isClosed()
          ? await this.waitForReplacementPage(target.browserPageId, page)
          : page
      if (!currentPage) {
        throw new BrowserError(
          'browser_tab_not_found',
          `Browser page ${target.browserPageId} is no longer available`
        )
      }
      const info = currentPage.getInfo()
      return { url: info.url, title: info.title }
    })
  }

  async screenshot(
    format?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserScreenshotResult> {
    // Why: agent-browser writes the screenshot to a temp file and returns
    // { "path": "/tmp/screenshot-xxx.png" }. We read the file and return base64.
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        return this.captureScreenshotCommand(sessionName, ['screenshot'], 300, format)
      },
      { ensureVisible: false }
    )
  }

  async fullPageScreenshot(
    format?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserScreenshotResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName, target) => {
        return this.captureFullPageScreenshotCommand(
          sessionName,
          target.browserPageId,
          500,
          format === 'jpeg' ? 'jpeg' : 'png'
        )
      },
      { ensureVisible: false }
    )
  }

  protected readScreenshotFromResult(raw: unknown, format?: string): BrowserScreenshotResult {
    const parsed = raw as { path?: string } | undefined
    if (!parsed?.path) {
      throw new BrowserError('browser_error', 'Screenshot returned no file path')
    }
    if (!existsSync(parsed.path)) {
      throw new BrowserError('browser_error', `Screenshot file not found: ${parsed.path}`)
    }
    const data = readFileSync(parsed.path).toString('base64')
    return { data, format: format === 'jpeg' ? 'jpeg' : 'png' } as BrowserScreenshotResult
  }

  protected async captureScreenshotCommand(
    sessionName: string,
    commandArgs: string[],
    settleMs: number,
    format?: string
  ): Promise<BrowserScreenshotResult> {
    return this.withSerializedScreenshotAccess(async () => {
      const session = this.sessions.get(sessionName)
      const restore = session
        ? await this.browserPages.acquireAutomationVisibility(session.browserPageId)
        : () => {}
      try {
        // Why: after acquiring the hidden paintability lease, the compositor
        // needs a short settle period to produce a painted frame. Waiting inside
        // the global screenshot lock prevents another tab from changing lease
        // state before the current capture actually hits CDP.
        await new Promise((r) => setTimeout(r, settleMs))
        const raw = await this.execAgentBrowser(sessionName, commandArgs)
        return this.readScreenshotFromResult(raw, format)
      } finally {
        restore()
      }
    })
  }

  protected async captureFullPageScreenshotCommand(
    sessionName: string,
    browserPageId: string,
    settleMs: number,
    format: 'png' | 'jpeg'
  ): Promise<BrowserScreenshotResult> {
    return this.withSerializedScreenshotAccess(async () => {
      const session = this.sessions.get(sessionName)
      const restore = session
        ? await this.browserPages.acquireAutomationVisibility(session.browserPageId)
        : () => {}
      try {
        // Why: full-page capture still depends on the guest compositor producing
        // a fresh frame. Wait after the target webview is paintable so the direct
        // CDP capture sees the live page instead of a stale surface.
        await new Promise((r) => setTimeout(r, settleMs))
        const page = this.browserPages.getPage(browserPageId)
        if (!page) {
          throw new BrowserError('browser_tab_not_found', 'Tab is no longer available')
        }
        return await captureFullPageScreenshot(page, format)
      } catch (error) {
        throw new BrowserError('browser_error', (error as Error).message)
      } finally {
        restore()
      }
    })
  }

  protected async withSerializedScreenshotAccess<T>(execute: () => Promise<T>): Promise<T> {
    const previousTurn = this.screenshotTurn.catch(() => {})
    let releaseTurn!: () => void
    this.screenshotTurn = new Promise<void>((resolve) => {
      releaseTurn = resolve
    })
    await previousTurn
    try {
      return await execute()
    } finally {
      releaseTurn()
    }
  }
}
