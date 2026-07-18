import { existsSync, readFileSync } from 'node:fs'
import type { ElectronApplication } from '@playwright/test'
import { test, expect } from './helpers/yiru-app'
import { TEST_REPO_PATH_FILE } from './global-setup'
import { waitForActiveTerminalManager, waitForPaneCount } from './helpers/terminal'
import {
  ensureTerminalVisible,
  getActiveTabId,
  getWorktreeTabs,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/yiru-restart'
import { RuntimeClient } from '../../src/cli/runtime/client'
import { RuntimeClientError } from '../../src/cli/runtime/types'
import type {
  RuntimeTerminalClose,
  RuntimeTerminalListResult,
  RuntimeTerminalSplit
} from '../../src/shared/runtime-types'

test.describe.configure({ mode: 'serial' })

test('durable whole-tab close removes a split tab across restart', async (// oxlint-disable-next-line no-empty-pattern -- This lifecycle test owns both Electron launches and intentionally opts out of the default app fixture.
{}, testInfo) => {
  const repoPath = readFileSync(TEST_REPO_PATH_FILE, 'utf8').trim()
  if (!repoPath || !existsSync(repoPath)) {
    test.skip(true, 'Global setup did not produce a seeded test repo')
    return
  }

  const session = createRestartSession(testInfo)
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null

  try {
    const firstLaunch = await session.launch()
    firstApp = firstLaunch.app
    const worktreeId = await attachRepoAndOpenTerminal(firstLaunch.page, repoPath)
    await waitForSessionReady(firstLaunch.page)
    await waitForActiveWorktree(firstLaunch.page)
    await ensureTerminalVisible(firstLaunch.page)

    const hasPaneManager = await waitForActiveTerminalManager(firstLaunch.page, 30_000)
      .then(() => true)
      .catch(() => false)
    test.skip(
      !hasPaneManager,
      'Electron automation in this environment never mounted the TerminalPane manager.'
    )
    await waitForPaneCount(firstLaunch.page, 1, 30_000)

    const closedTabId = await getActiveTabId(firstLaunch.page)
    if (!closedTabId) {
      throw new Error('First launch did not expose an active terminal tab')
    }
    expect(await getWorktreeTabs(firstLaunch.page, worktreeId)).toHaveLength(1)

    const client = new RuntimeClient(session.userDataDir, 30_000)
    let activeHandle: string | null = null
    await expect
      .poll(
        async () => {
          try {
            const active = await client.call<{ handle: string }>('terminal.resolveActive', {
              worktree: `id:${worktreeId}`
            })
            activeHandle = active.result.handle
            return activeHandle
          } catch (error) {
            if (!(error instanceof RuntimeClientError) || error.code !== 'selector_not_found') {
              throw error
            }
            // Why: repo attachment can briefly race the runtime's pre-add
            // worktree cache even after the renderer has mounted its terminal.
            return null
          }
        },
        {
          timeout: 30_000,
          message: 'The runtime never resolved the renderer-mounted terminal'
        }
      )
      .not.toBeNull()
    if (!activeHandle) {
      throw new Error('The runtime did not expose an active terminal handle')
    }
    const split = await client.call<{ split: RuntimeTerminalSplit }>('terminal.split', {
      terminal: activeHandle,
      direction: 'vertical'
    })
    expect(split.result.split.tabId).toBe(closedTabId)
    await waitForPaneCount(firstLaunch.page, 2, 30_000)

    const close = await client.call<{ close: RuntimeTerminalClose }>('terminal.closeTab', {
      terminal: split.result.split.handle
    })
    expect(close.result.close).toMatchObject({
      handle: split.result.split.handle,
      tabId: closedTabId,
      closeMode: 'tab'
    })
    await expect
      .poll(() => getWorktreeTabs(firstLaunch.page, worktreeId), {
        message: 'The acknowledged close left the split terminal tab in renderer state'
      })
      .toEqual([])

    const afterClose = await client.call<RuntimeTerminalListResult>('terminal.list', {
      worktree: `id:${worktreeId}`
    })
    expect(
      afterClose.result.terminals.filter((terminal) => terminal.tabId === closedTabId)
    ).toEqual([])

    await session.close(firstApp)
    firstApp = null

    const secondLaunch = await session.launch()
    secondApp = secondLaunch.app
    await waitForSessionReady(secondLaunch.page)
    const restoredWorktreeId = await attachRepoAndOpenTerminal(secondLaunch.page, repoPath)
    expect(restoredWorktreeId).toBe(worktreeId)

    // Why: activation may create a fresh fallback terminal for an empty
    // worktree; persistence is correct when the closed split tab stays gone.
    await secondLaunch.page.waitForTimeout(1_000)
    const restoredTabs = await getWorktreeTabs(secondLaunch.page, worktreeId)
    expect(restoredTabs).toHaveLength(1)
    expect(restoredTabs.map((tab) => tab.id)).not.toContain(closedTabId)
    expect(
      await secondLaunch.page.evaluate((closedTabId) => {
        return window.__store?.getState().terminalLayoutsByTabId[closedTabId]
      }, closedTabId)
    ).toBeUndefined()
  } finally {
    if (firstApp) {
      await session.close(firstApp)
    }
    if (secondApp) {
      await session.close(secondApp)
    }
    await session.dispose()
  }
})
