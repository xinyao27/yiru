/**
 * Stress test for dead-terminal reproduction (setup-split flow).
 *
 * Why @headful: the dead-terminal bug is a WebGL canvas staleness issue — after
 * wrapInSplit() reparents the existing pane's container, the WebGL canvas can
 * fail to repaint. In headless mode WebGL is NEVER active, so the DOM fallback
 * renderer is used and the bug cannot manifest. Running headful ensures real
 * WebGL contexts matching production.
 *
 * See helpers/dead-terminal.ts for the shared worktree-creation helper that
 * replicates the exact activateAndRevealWorktree + ensureWorktreeHasInitialTerminal
 * production flow.
 */

import { test, expect } from './helpers/yiru-app'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  switchToWorktree,
  ensureTerminalVisible
} from './helpers/store'
import { waitForActiveTerminalManager, waitForPaneCount } from './helpers/terminal'
import {
  createAndActivateWorktreeWithSetup,
  removeWorktreeViaStore,
  waitForAllPanesToHaveContent,
  checkWebglState
} from './helpers/dead-terminal'

const STRESS_ITERATIONS = 5

test.describe('Dead Terminal Reproduction @headful', () => {
  const createdWorktreeIds: string[] = []

  test.beforeEach(async ({ yiruPage }) => {
    await waitForSessionReady(yiruPage)
    await waitForActiveWorktree(yiruPage)
    await ensureTerminalVisible(yiruPage)

    await yiruPage.evaluate(async () => {
      const state = window.__store?.getState()
      if (!state) {
        return
      }
      state.updateSettings({ setupScriptLaunchMode: 'split-vertical' })
    })
  })

  test.afterEach(async ({ yiruPage }) => {
    for (const id of createdWorktreeIds) {
      await removeWorktreeViaStore(yiruPage, id)
    }
    createdWorktreeIds.length = 0
  })

  test('@headful setup-split flow does not produce dead terminals', async ({ yiruPage }) => {
    test.setTimeout(120_000)
    const homeWorktreeId = await waitForActiveWorktree(yiruPage)
    await waitForActiveTerminalManager(yiruPage, 30_000)
    await checkWebglState(yiruPage, 'home-initial')

    for (let i = 0; i < STRESS_ITERATIONS; i++) {
      const direction = i % 2 === 0 ? 'vertical' : 'horizontal'
      const newId = await createAndActivateWorktreeWithSetup(yiruPage, `setup-${i}`, direction)
      createdWorktreeIds.push(newId)

      await expect.poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 }).toBe(newId)
      await ensureTerminalVisible(yiruPage)
      await waitForActiveTerminalManager(yiruPage, 30_000)
      await waitForPaneCount(yiruPage, 2, 15_000)
      await checkWebglState(yiruPage, `setup-${i}`)
      await waitForAllPanesToHaveContent(yiruPage, `setup-${i} both panes`)

      await switchToWorktree(yiruPage, homeWorktreeId)
      await expect
        .poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 })
        .toBe(homeWorktreeId)
      await removeWorktreeViaStore(yiruPage, newId)
      createdWorktreeIds.pop()
    }
  })

  test('@headful setup-split then switch-back does not leave panes dead', async ({ yiruPage }) => {
    test.setTimeout(120_000)
    const homeWorktreeId = await waitForActiveWorktree(yiruPage)
    await waitForActiveTerminalManager(yiruPage, 30_000)

    for (let i = 0; i < STRESS_ITERATIONS; i++) {
      const newId = await createAndActivateWorktreeWithSetup(
        yiruPage,
        `switchback-${i}`,
        'vertical'
      )
      createdWorktreeIds.push(newId)

      await expect.poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 }).toBe(newId)
      await ensureTerminalVisible(yiruPage)
      await waitForActiveTerminalManager(yiruPage, 30_000)
      await waitForPaneCount(yiruPage, 2, 15_000)
      await waitForAllPanesToHaveContent(yiruPage, `switchback-${i} initial`)

      await switchToWorktree(yiruPage, homeWorktreeId)
      await expect
        .poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 })
        .toBe(homeWorktreeId)
      await ensureTerminalVisible(yiruPage)
      await waitForActiveTerminalManager(yiruPage, 15_000)

      await switchToWorktree(yiruPage, newId)
      await expect.poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 }).toBe(newId)
      await ensureTerminalVisible(yiruPage)
      await waitForActiveTerminalManager(yiruPage, 15_000)
      await waitForAllPanesToHaveContent(yiruPage, `switchback-${i} after return`)

      await switchToWorktree(yiruPage, homeWorktreeId)
      await expect
        .poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 })
        .toBe(homeWorktreeId)
      await removeWorktreeViaStore(yiruPage, newId)
      createdWorktreeIds.pop()
    }
  })

  test('@headful rapid switching between many setup-split worktrees', async ({ yiruPage }) => {
    test.setTimeout(120_000)
    const homeWorktreeId = await waitForActiveWorktree(yiruPage)
    await waitForActiveTerminalManager(yiruPage, 30_000)

    const worktreeIds = [homeWorktreeId]
    for (let i = 0; i < 4; i++) {
      const newId = await createAndActivateWorktreeWithSetup(yiruPage, `multi-${i}`, 'vertical')
      createdWorktreeIds.push(newId)
      worktreeIds.push(newId)

      await expect.poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 }).toBe(newId)
      await ensureTerminalVisible(yiruPage)
      await waitForActiveTerminalManager(yiruPage, 30_000)
      await waitForPaneCount(yiruPage, 2, 15_000)
      await waitForAllPanesToHaveContent(yiruPage, `multi-create-${i}`)
    }

    for (let round = 0; round < 3; round++) {
      for (const wId of worktreeIds) {
        await switchToWorktree(yiruPage, wId)
        await expect.poll(async () => getActiveWorktreeId(yiruPage), { timeout: 10_000 }).toBe(wId)
        await ensureTerminalVisible(yiruPage)
        await waitForActiveTerminalManager(yiruPage, 15_000)
        await waitForAllPanesToHaveContent(yiruPage, `multi-r${round}-${wId.slice(0, 8)}`)
      }
    }
  })
})
