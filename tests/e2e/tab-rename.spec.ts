/**
 * E2E tests for inline tab renaming (double-click a tab to rename).
 *
 * User Prompt:
 * - double-click a tab to rename it inline
 */

import { test, expect } from './helpers/yiru-app'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  getActiveTabId,
  getWorktreeTabs,
  ensureTerminalVisible
} from './helpers/store'

test.describe('Tab Rename (Inline)', () => {
  test.beforeEach(async ({ yiruPage }) => {
    await waitForSessionReady(yiruPage)
    await waitForActiveWorktree(yiruPage)
    await ensureTerminalVisible(yiruPage)
    // Why: clear any custom titles left by a previous test (the Electron app
    // persists across tests in the worker) so tab locators key off the default
    // title, not a stale rename like "My Custom Title".
    await yiruPage.evaluate(() => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      for (const tabs of Object.values(state.tabsByWorktree)) {
        for (const tab of tabs) {
          if (tab.customTitle != null) {
            state.setTabCustomTitle(tab.id, null)
          }
        }
      }
    })
  })

  async function getActiveTabTitle(
    page: Parameters<typeof getActiveTabId>[0],
    worktreeId: string
  ): Promise<string> {
    const activeId = await getActiveTabId(page)
    expect(activeId).not.toBeNull()
    const tabs = await getWorktreeTabs(page, worktreeId)
    const tab = tabs.find((entry) => entry.id === activeId)
    expect(tab).toBeDefined()
    // Why: mirror what the UI renders (customTitle ?? title) so locators that
    // key off the tab's visible text match what's actually on screen.
    return tab!.customTitle ?? tab!.title ?? ''
  }

  function tabLocatorByTitle(
    page: Parameters<typeof getActiveTabId>[0],
    title: string
  ): ReturnType<Parameters<typeof getActiveTabId>[0]['locator']> {
    // Why: backslash first so the backslashes we introduce when escaping the
    // double-quote aren't themselves re-escaped; both chars are CSS-selector
    // metacharacters inside a double-quoted attribute value.
    const escaped = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return page.locator(`[data-testid="sortable-tab"][data-tab-title="${escaped}"]`).first()
  }

  async function dispatchMiddleClickSequence(
    locator: ReturnType<Parameters<typeof getActiveTabId>[0]['locator']>
  ): Promise<void> {
    await locator.evaluate((element) => {
      const eventInit = { bubbles: true, cancelable: true, button: 1 }
      element.dispatchEvent(new MouseEvent('mousedown', { ...eventInit, buttons: 4 }))
      element.dispatchEvent(new MouseEvent('mouseup', eventInit))
      element.dispatchEvent(new MouseEvent('auxclick', eventInit))
    })
  }

  async function getActiveCustomTitle(
    page: Parameters<typeof getActiveTabId>[0],
    worktreeId: string
  ): Promise<string | null> {
    return page.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return null
      }

      const state = store.getState()
      const activeId = state.activeTabIdByWorktree[targetWorktreeId] ?? state.activeTabId
      const tab = (state.tabsByWorktree[targetWorktreeId] ?? []).find((t) => t.id === activeId)
      return tab?.customTitle ?? null
    }, worktreeId)
  }

  test('double-clicking a tab opens an inline rename input and Enter commits', async ({
    yiruPage
  }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!
    const originalTitle = await getActiveTabTitle(yiruPage, worktreeId)
    expect(originalTitle.length).toBeGreaterThan(0)

    const tabLocator = tabLocatorByTitle(yiruPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = yiruPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('My Custom Title')
    await renameInput.press('Enter')

    await expect
      .poll(async () => getActiveCustomTitle(yiruPage, worktreeId), { timeout: 3_000 })
      .toBe('My Custom Title')
    await expect(renameInput).toBeHidden()
    await expect(tabLocatorByTitle(yiruPage, 'My Custom Title')).toBeVisible()
  })

  test('context-menu Change Title opens a focused select-all rename input', async ({
    yiruPage
  }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!
    const originalTitle = await getActiveTabTitle(yiruPage, worktreeId)
    expect(originalTitle.length).toBeGreaterThan(0)

    await tabLocatorByTitle(yiruPage, originalTitle).click({ button: 'right' })
    // Why: the accessible name includes the platform shortcut suffix.
    await yiruPage.getByRole('menuitem', { name: /^Change Title\b/ }).click()

    const renameInput = yiruPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()
    await expect(renameInput).toBeFocused()

    // Why: after the context-menu path proves focus lands in the inline input,
    // fill avoids per-keystroke timing races in the shared full-suite browser.
    await renameInput.fill('Context Menu Title')
    await renameInput.press('Enter')

    await expect
      .poll(async () => getActiveCustomTitle(yiruPage, worktreeId), { timeout: 3_000 })
      .toBe('Context Menu Title')
    await expect(tabLocatorByTitle(yiruPage, 'Context Menu Title')).toBeVisible()
  })

  test('Escape during inline rename discards the edit', async ({ yiruPage }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!
    const originalTitle = await getActiveTabTitle(yiruPage, worktreeId)

    const tabLocator = tabLocatorByTitle(yiruPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = yiruPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('Should Be Discarded')
    await renameInput.press('Escape')

    await expect(renameInput).toBeHidden()
    // Why: the final assertion must be on user-observable DOM, not the store's
    // customTitle field. A render-layer bug where the tab silently paints the
    // in-progress "Should Be Discarded" text would leave customTitle null
    // (Escape cleared it) yet flash the discarded label to the user — the
    // original title must still be the one rendered on the tab.
    await expect(tabLocatorByTitle(yiruPage, originalTitle)).toBeVisible()
    await expect
      .poll(async () => getActiveCustomTitle(yiruPage, worktreeId), { timeout: 3_000 })
      .toBe(null)
  })

  test('renaming to an empty string resets the tab to its default title', async ({ yiruPage }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!

    // Snapshot the default (non-custom) title first so the DOM assertion later
    // can verify the tab reverts to *this exact* rendered text — a store-only
    // `customTitle === null` check would pass even if the rendered label was
    // stuck on "Seeded Custom".
    const defaultTitle = await getActiveTabTitle(yiruPage, worktreeId)
    expect(defaultTitle.length).toBeGreaterThan(0)

    // Why: seed a custom title directly via the store so this test asserts the
    // "empty string → reset" behavior independently from the double-click flow.
    await yiruPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }

      const state = store.getState()
      const activeId = state.activeTabIdByWorktree[targetWorktreeId] ?? state.activeTabId
      if (activeId) {
        state.setTabCustomTitle(activeId, 'Seeded Custom')
      }
    }, worktreeId)

    await expect
      .poll(async () => getActiveCustomTitle(yiruPage, worktreeId), { timeout: 3_000 })
      .toBe('Seeded Custom')

    const tabLocator = tabLocatorByTitle(yiruPage, 'Seeded Custom')
    await tabLocator.dblclick()

    const renameInput = yiruPage.getByRole('textbox', {
      name: 'Rename tab Seeded Custom',
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('')
    await renameInput.press('Enter')

    // User-observable DOM assertion: the tab element must re-render with the
    // original default title, not the "Seeded Custom" override.
    await expect(tabLocatorByTitle(yiruPage, defaultTitle)).toBeVisible()
    await expect
      .poll(async () => getActiveCustomTitle(yiruPage, worktreeId), { timeout: 3_000 })
      .toBe(null)
  })

  test('clicking away (blur) commits the rename', async ({ yiruPage }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!

    // Why: need a second tab so we have something to click that isn't the
    // rename input itself. Seed both with known titles so we can locate them.
    await yiruPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      const existing = state.tabsByWorktree[targetWorktreeId] ?? []
      if (existing.length < 2) {
        state.createTab(targetWorktreeId)
      }
    }, worktreeId)

    await expect
      .poll(async () => (await getWorktreeTabs(yiruPage, worktreeId)).length, { timeout: 3_000 })
      .toBeGreaterThanOrEqual(2)

    const tabs = await getWorktreeTabs(yiruPage, worktreeId)
    const activeId = await getActiveTabId(yiruPage)
    const activeTab = tabs.find((t) => t.id === activeId)!
    const otherTab = tabs.find((t) => t.id !== activeId)!

    const tabLocator = tabLocatorByTitle(yiruPage, activeTab.title!)
    await tabLocator.dblclick()

    const renameInput = yiruPage.getByRole('textbox', {
      name: `Rename tab ${activeTab.title}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('Committed By Blur')
    // Why: clicking the other tab triggers blur on the input, which should
    // run commitRename and save the typed title before the focus shifts.
    await tabLocatorByTitle(yiruPage, otherTab.title!).click()

    await expect(renameInput).toBeHidden()
    await expect(tabLocatorByTitle(yiruPage, 'Committed By Blur')).toBeVisible()
    expect(
      await yiruPage.evaluate(
        ({ targetWorktreeId, targetTabId }) => {
          const store = window.__store
          const state = store!.getState()
          const tab = (state.tabsByWorktree[targetWorktreeId] ?? []).find(
            (t) => t.id === targetTabId
          )
          return tab?.customTitle ?? null
        },
        { targetWorktreeId: worktreeId, targetTabId: activeTab.id }
      )
    ).toBe('Committed By Blur')
  })

  test('right-clicking during inline rename commits and opens context menu', async ({
    yiruPage
  }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!
    const originalTitle = await getActiveTabTitle(yiruPage, worktreeId)

    const tabLocator = tabLocatorByTitle(yiruPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = yiruPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('Committed By Right Click')
    // Why: right-clicking the tab blurs the input (commitRename runs) and
    // opens the context menu. We assert the rename was saved; the menu
    // assertion is intentionally light because the menu markup is shared
    // with other specs.
    await tabLocator.click({ button: 'right' })

    await expect
      .poll(async () => getActiveCustomTitle(yiruPage, worktreeId), { timeout: 3_000 })
      .toBe('Committed By Right Click')
    await expect(renameInput).toBeHidden()
  })

  test('middle-clicking inside the rename input does not close the tab', async ({ yiruPage }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!
    const tabsBefore = (await getWorktreeTabs(yiruPage, worktreeId)).length
    const originalTitle = await getActiveTabTitle(yiruPage, worktreeId)

    const tabLocator = tabLocatorByTitle(yiruPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = yiruPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    // Why: the outer tab's middle-click handler closes the tab. The rename
    // input stops propagation + preventDefaults middle-click so the tab
    // isn't closed while the user is editing.
    await dispatchMiddleClickSequence(renameInput)

    // The tab must still exist — no regression where editing-then-middle-click
    // accidentally closes the tab out from under the input.
    await expect(renameInput).toBeVisible()
    await expect(tabLocatorByTitle(yiruPage, originalTitle)).toBeVisible()
    expect((await getWorktreeTabs(yiruPage, worktreeId)).length).toBe(tabsBefore)
  })
})
