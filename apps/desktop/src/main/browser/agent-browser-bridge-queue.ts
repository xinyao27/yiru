import type { BrowserAgentCommandResult } from '@yiru/runtime-protocol/contract'
import type { BrowserBackResult } from '~shared/runtime-types'

import { parseShellArgs, stripAgentBrowserTargetArgs } from './agent-browser-bridge-command'
import type {
  EnqueueTargetedCommandOptions,
  ResolvedBrowserCommandTarget
} from './agent-browser-bridge-input'
import { AgentBrowserBridgeSessions } from './agent-browser-bridge-sessions'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeQueue extends AgentBrowserBridgeSessions {
  async exec(
    command: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      // Why: strip target/session flags from raw passthrough commands so a
      // caller cannot override Yiru's selected browser page or CDP proxy.
      const args = stripAgentBrowserTargetArgs(parseShellArgs(command.trim()))
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Session lifecycle ──

  protected async navigateHistory(
    direction: 'back' | 'forward',
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserBackResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName, target) => {
        const page = this.browserPages.getPage(target.browserPageId)
        if (page?.navigateHistory) {
          await page.navigateHistory(direction)
          const info = page.getInfo()
          return { url: info.url, title: info.title }
        }

        // Chrome-backed remote pages do not expose Electron's navigationHistory;
        // keep the agent-browser CDP path for those hosts.
        await this.ensureSession(sessionName, target.browserPageId, target.backendPageId)
        return (await this.execAgentBrowser(sessionName, [direction])) as BrowserBackResult
      },
      { ensureSession: false }
    )
  }

  async destroyAllSessions(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const sessionName of this.sessions.keys()) {
      promises.push(this.destroySession(sessionName))
    }
    await Promise.allSettled(promises)
    this.pendingInterceptRestore.clear()
  }

  // ── Internal ──

  protected async enqueueCommand<T>(
    worktreeId: string | undefined,
    execute: (sessionName: string) => Promise<T>
  ): Promise<T> {
    return this.enqueueTargetedCommand(
      worktreeId,
      undefined,
      async (sessionName) => execute(sessionName),
      { ensureVisible: false }
    )
  }

  protected async enqueueTargetedCommand<T>(
    worktreeId: string | undefined,
    browserPageId: string | undefined,
    execute: (sessionName: string, target: ResolvedBrowserCommandTarget) => Promise<T>,
    options: EnqueueTargetedCommandOptions = {}
  ): Promise<T> {
    const target = this.resolveCommandTarget(worktreeId, browserPageId, options.requireScopedTarget)
    const sessionName = `yiru-tab-${target.browserPageId}`

    if (options.ensureSession !== false) {
      await this.ensureSession(sessionName, target.browserPageId, target.backendPageId)
    }

    return new Promise<T>((resolve, reject) => {
      let queue = this.commandQueues.get(sessionName)
      if (!queue) {
        queue = []
        this.commandQueues.set(sessionName, queue)
      }
      queue.push({
        execute: (() =>
          this.executeWithVisibleTarget(
            sessionName,
            worktreeId,
            target,
            execute,
            options
          )) as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject
      })
      this.processQueue(sessionName)
    })
  }

  protected async executeWithVisibleTarget<T>(
    sessionName: string,
    worktreeId: string | undefined,
    target: ResolvedBrowserCommandTarget,
    execute: (sessionName: string, target: ResolvedBrowserCommandTarget) => Promise<T>,
    options: EnqueueTargetedCommandOptions
  ): Promise<T> {
    if (options.ensureVisible === false) {
      return execute(sessionName, target)
    }

    // Why: inactive browser panes are display:none in the renderer; the
    // automation lease makes only this target paintable without selecting it.
    const restore = await this.browserPages.acquireAutomationVisibility(target.browserPageId)
    try {
      const visibleTarget = await this.refreshTargetAfterAutomationVisibility(
        sessionName,
        worktreeId,
        target,
        options
      )
      return await execute(sessionName, visibleTarget)
    } finally {
      restore()
    }
  }

  protected async refreshTargetAfterAutomationVisibility(
    sessionName: string,
    worktreeId: string | undefined,
    target: ResolvedBrowserCommandTarget,
    options: EnqueueTargetedCommandOptions
  ): Promise<ResolvedBrowserCommandTarget> {
    const visibleTarget = this.resolveCommandTarget(worktreeId, target.browserPageId)
    if (visibleTarget.backendPageId === target.backendPageId) {
      return visibleTarget
    }

    // Why: making a parked webview paintable can re-register the same browser
    // page with a new guest webContents. Tear down any stale named session now;
    // DOM commands recreate immediately, direct-CDP commands let the next DOM
    // command recreate against the live guest.
    await this.restartSessionForTarget(
      sessionName,
      visibleTarget.browserPageId,
      visibleTarget.backendPageId,
      { recreate: options.ensureSession !== false }
    )

    return visibleTarget
  }

  protected async processQueue(sessionName: string): Promise<void> {
    if (this.processingQueues.has(sessionName)) {
      return
    }
    this.processingQueues.add(sessionName)

    const queue = this.commandQueues.get(sessionName)
    while (queue && queue.length > 0) {
      const cmd = queue.shift()!
      try {
        const result = await cmd.execute()
        cmd.resolve(result)
      } catch (error) {
        cmd.reject(error)
      }
    }

    if (queue && queue.length === 0 && this.commandQueues.get(sessionName) === queue) {
      this.commandQueues.delete(sessionName)
    }
    this.processingQueues.delete(sessionName)
  }
}
