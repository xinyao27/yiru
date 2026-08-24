import type { BrowserAgentCommandResult } from '@yiru/runtime-protocol/contract'
import { assertClipboardTextWriteWithinLimitWithYield } from '@yiru/workbench-model/ui'
import type {
  BrowserTabInfo,
  BrowserTabListResult,
  BrowserTabSwitchResult,
  BrowserSnapshotResult,
  BrowserClickResult,
  BrowserGotoResult,
  BrowserFillResult,
  BrowserTypeResult,
  BrowserSelectResult,
  BrowserScrollResult
} from '~shared/runtime-types'

import {
  AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES,
  focusedValueSetExpression
} from './agent-browser-bridge-input'
import { AgentBrowserBridgeTabs } from './agent-browser-bridge-tabs'
import { BrowserError } from './cdp-bridge'
import { iterateBrowserTextInsertionChunks } from './text-insertion'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeNavigation extends AgentBrowserBridgeTabs {
  tabList(worktreeId?: string): BrowserTabListResult {
    const tabs = this.getRegisteredTabs(worktreeId)
    // Why: use per-worktree active tab for the "active" flag so tab-list is
    // consistent with what resolveActiveTab would pick for command routing.
    // Keep this read-only though: discovery commands must not mutate the
    // active-tab state that later bare commands rely on.
    let activeBrowserPageId =
      (worktreeId && this.activePagePerWorktree.get(worktreeId)) ?? this.activePageId
    const result: BrowserTabInfo[] = []
    let index = 0
    let firstLivePageId: string | null = null
    for (const [tabId] of tabs) {
      const page = this.browserPages.getPage(tabId)
      if (!page) {
        this.browserPages.unregisterPage(tabId)
        continue
      }
      const info = page.getInfo()
      if (firstLivePageId === null) {
        firstLivePageId = tabId
      }
      const loadError = this.browserPages.getBrowserPageLoadError(tabId)
      const certificateFailure = this.browserPages.getBrowserPageCertificateFailure(tabId)
      result.push({
        browserPageId: tabId,
        index: index++,
        // Why: failed WebContents report chrome-error://, which is neither
        // actionable nor the address the user asked to load.
        url: loadError?.validatedUrl ?? info.url,
        title: info.title,
        active: tabId === activeBrowserPageId,
        loadError,
        certificateFailure
      })
    }
    // Why: if no tab has been explicitly activated yet, surface the first live
    // tab as active in the listing without mutating bridge state. That keeps
    // `tab list` side-effect free while still showing users which tab a bare
    // command would select next.
    if (activeBrowserPageId == null && firstLivePageId !== null) {
      activeBrowserPageId = firstLivePageId
      if (result.length > 0) {
        result[0].active = true
      }
    }
    return { tabs: result }
  }

  // Why: tab switch must go through the command queue to prevent race conditions
  // with in-flight commands that target the previously active tab.
  async tabSwitch(
    index: number | undefined,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserTabSwitchResult> {
    return this.enqueueCommand(worktreeId, async () => {
      const tabs = this.getRegisteredTabs(worktreeId)
      // Why: queue delay means the tab list can change between RPC arrival and
      // execution time. Recompute against live webContents here so we never
      // activate a tab index that disappeared while earlier commands were running.
      const liveEntries = [...tabs.entries()].filter(([tabId]) => this.browserPages.getPage(tabId))
      let switchedIndex = index ?? -1
      let resolvedPageId = browserPageId
      if (resolvedPageId) {
        switchedIndex = liveEntries.findIndex(([tabId]) => tabId === resolvedPageId)
      }
      if (switchedIndex < 0 || switchedIndex >= liveEntries.length) {
        const targetLabel =
          resolvedPageId != null ? `Browser page ${resolvedPageId}` : `Tab index ${index}`
        throw new BrowserError(
          'browser_tab_not_found',
          `${targetLabel} out of range (0-${liveEntries.length - 1})`
        )
      }
      const [tabId] = liveEntries[switchedIndex]
      this.activePageId = tabId
      // Why: resolveActiveTab prefers the per-worktree map over the global when
      // worktreeId is provided. Without this update, subsequent commands would
      // still route to the previous tab despite tabSwitch reporting success.
      const owningWorktreeId = worktreeId ?? this.browserPages.getWorktreeIdForTab(tabId)
      // Why: `tab switch --page <id>` may omit --worktree because the page id is
      // already a stable target. We still need to update the owning worktree's
      // active-tab slot so later worktree-scoped commands follow the tab that was
      // just activated instead of the previously active one.
      if (owningWorktreeId) {
        this.activePagePerWorktree.set(owningWorktreeId, tabId)
      }
      this.options.onTabsChanged?.(owningWorktreeId ?? undefined)
      return { switched: switchedIndex, browserPageId: tabId }
    })
  }

  // ── Core commands (typed) ──

  async snapshot(worktreeId?: string, browserPageId?: string): Promise<BrowserSnapshotResult> {
    // Why: snapshot creates fresh refs so it must bypass the stale-ref guard
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName, target) => {
      const result = (await this.execAgentBrowser(sessionName, [
        'snapshot'
      ])) as BrowserSnapshotResult
      return {
        ...result,
        browserPageId: target.browserPageId
      }
    })
  }

  async click(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserClickResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['click', element])) as BrowserClickResult
    })
  }

  async dblclick(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserClickResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['dblclick', element])) as BrowserClickResult
    })
  }

  async goto(url: string, worktreeId?: string, browserPageId?: string): Promise<BrowserGotoResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['goto', url])) as BrowserGotoResult
    })
  }

  async fill(
    element: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserFillResult> {
    await assertClipboardTextWriteWithinLimitWithYield(value)
    // Why: agent-browser's CDP text insertion loses focus in Electron guests.
    // Resolve the ref first, then edit through the browser's input pipeline.
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        if (!(await this.isExplicitContentEditableTarget(sessionName, element))) {
          await this.execAgentBrowser(sessionName, ['focus', element])
          await this.execAgentBrowser(sessionName, [
            'eval',
            focusedValueSetExpression(JSON.stringify(''))
          ])
          for (const chunk of iterateBrowserTextInsertionChunks(
            value,
            AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES
          )) {
            await this.execAgentBrowser(sessionName, [
              'eval',
              focusedValueSetExpression(JSON.stringify(chunk), { append: true })
            ])
          }
          await this.execAgentBrowser(sessionName, [
            'eval',
            focusedValueSetExpression(JSON.stringify(''), { append: true, dispatchEvents: true })
          ])
          return { filled: element } as BrowserFillResult
        }

        await this.fillExplicitContentEditable(sessionName, element, value)
        return { filled: element } as BrowserFillResult
      },
      { requireScopedTarget: true }
    )
  }

  async type(
    input: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserTypeResult> {
    await assertClipboardTextWriteWithinLimitWithYield(input)
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        for (const chunk of iterateBrowserTextInsertionChunks(
          input,
          AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES
        )) {
          await this.execAgentBrowser(sessionName, ['keyboard', 'type', chunk])
        }
        return { typed: true } as BrowserTypeResult
      },
      { requireScopedTarget: true }
    )
  }

  async select(
    element: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserSelectResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'select',
        element,
        value
      ])) as BrowserSelectResult
    })
  }

  async scroll(
    direction: string,
    amount?: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserScrollResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['scroll', direction]
      if (amount != null) {
        args.push(String(amount))
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserScrollResult
    })
  }

  async scrollIntoView(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'scrollintoview',
        element
      ])) as BrowserAgentCommandResult
    })
  }

  async get(
    what: string,
    selector?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['get', what]
      if (selector) {
        args.push(selector)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async is(
    what: string,
    selector: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'is',
        what,
        selector
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Keyboard commands ──
}
