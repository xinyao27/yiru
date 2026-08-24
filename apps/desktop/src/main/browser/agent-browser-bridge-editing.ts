import type {
  BrowserEvalResult,
  BrowserHoverResult,
  BrowserDragResult,
  BrowserUploadResult,
  BrowserWaitResult,
  BrowserCheckResult,
  BrowserFocusResult,
  BrowserClearResult,
  BrowserSelectAllResult,
  BrowserKeypressResult
} from '~shared/runtime-types'

import { WAIT_PROCESS_TIMEOUT_GRACE_MS } from './agent-browser-bridge-input'
import { AgentBrowserBridgeScreenshot } from './agent-browser-bridge-screenshot'
import { BrowserError } from './cdp-bridge'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeEditing extends AgentBrowserBridgeScreenshot {
  async evaluate(
    expression: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserEvalResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['eval', expression])) as BrowserEvalResult
    })
  }

  async hover(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserHoverResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['hover', element])) as BrowserHoverResult
    })
  }

  async drag(
    from: string,
    to: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserDragResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['drag', from, to])) as BrowserDragResult
    })
  }

  async upload(
    element: string,
    filePaths: string[],
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserUploadResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'upload',
        element,
        ...filePaths
      ])) as BrowserUploadResult
    })
  }

  async wait(
    options?: {
      selector?: string
      timeout?: number
      text?: string
      url?: string
      load?: string
      fn?: string
      state?: string
    },
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserWaitResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['wait']
      const hasCondition =
        !!options?.selector || !!options?.text || !!options?.url || !!options?.load || !!options?.fn
      if (options?.selector) {
        args.push(options.selector)
      } else if (options?.timeout != null && !hasCondition) {
        args.push(String(options.timeout))
      }
      if (options?.text) {
        args.push('--text', options.text)
      }
      if (options?.url) {
        args.push('--url', options.url)
      }
      if (options?.load) {
        args.push('--load', options.load)
      }
      if (options?.fn) {
        args.push('--fn', options.fn)
      }
      const normalizedState = options?.state === 'visible' ? undefined : options?.state
      if (normalizedState) {
        args.push('--state', normalizedState)
      }
      // Why: agent-browser's selector wait surface does not support `--state visible`
      // or a documented per-command `--timeout`. Yiru normalizes "visible" back
      // to the default selector wait semantics and enforces the requested timeout
      // at the bridge layer so missing selectors fail as browser_timeout instead
      // of hanging until the generic runtime RPC timeout fires.
      return (await this.execAgentBrowser(sessionName, args, {
        timeoutMs:
          options?.timeout != null && hasCondition
            ? options.timeout + WAIT_PROCESS_TIMEOUT_GRACE_MS
            : undefined,
        timeoutError:
          options?.timeout != null && hasCondition
            ? new BrowserError(
                'browser_timeout',
                `Timed out waiting for browser condition after ${options.timeout}ms.`
              )
            : undefined
      })) as BrowserWaitResult
    })
  }

  async check(
    element: string,
    checked: boolean,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserCheckResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = checked ? ['check', element] : ['uncheck', element]
      return (await this.execAgentBrowser(sessionName, args)) as BrowserCheckResult
    })
  }

  async focus(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserFocusResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['focus', element])) as BrowserFocusResult
    })
  }

  async clear(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserClearResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        if (!(await this.isExplicitContentEditableTarget(sessionName, element))) {
          // Why: agent-browser resolves this ref directly, preserving iframe,
          // shadow-root, and unfocusable-target semantics for ordinary fields.
          await this.execAgentBrowser(sessionName, ['fill', element, ''])
          return { cleared: element }
        }

        await this.fillExplicitContentEditable(sessionName, element, '')
        return { cleared: element }
      },
      { requireScopedTarget: true }
    )
  }

  async selectAll(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserSelectAllResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      // Why: agent-browser has no select-all command — implement as focus + Ctrl+A
      await this.execAgentBrowser(sessionName, ['focus', element])
      return (await this.execAgentBrowser(sessionName, [
        'press',
        'Control+a'
      ])) as BrowserSelectAllResult
    })
  }

  async keypress(
    key: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserKeypressResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['press', key])) as BrowserKeypressResult
    })
  }
}
