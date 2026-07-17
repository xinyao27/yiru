/* eslint-disable max-lines -- Terminal pane E2E is a serial coverage matrix for split, close, remake, move, resize, and retention flows. */
/**
 * E2E tests for terminal pane splitting, state retention, resizing, and closing.
 *
 * User Prompt:
 * - terminal panes can be split
 * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
 * - resizing terminal panes works
 * - closing panes works
 */

import type { Page } from '@playwright/test'
import { test, expect } from './helpers/yiru-app'
import {
  UUID_RE,
  discoverActivePtyId,
  execInTerminal,
  closeActiveTerminalPane,
  countVisibleTerminalPanes,
  focusLastTerminalPane,
  moveTerminalPaneByLeafId,
  readPaneIdentitySnapshot,
  readTerminalPaneDomLeafOrder,
  splitActiveTerminalPane,
  waitForPaneIdentitySnapshot,
  waitForActiveTerminalManager,
  waitForTerminalOutput,
  waitForPaneCount,
  getTerminalContent,
  sendToTerminal
} from './helpers/terminal'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  getActiveTabId,
  getActiveTabType,
  getWorktreeTabs,
  getAllWorktreeIds,
  switchToOtherWorktree,
  switchToWorktree,
  ensureTerminalVisible
} from './helpers/store'
import { pressShortcut } from './helpers/shortcuts'

async function setPaneTitleFromTerminalMenu(page: Page, title: string): Promise<void> {
  await openTerminalContextMenu(page)
  await page.getByText('Set Title…', { exact: true }).click()
  const titleInput = page.locator('.pane-title-input').first()
  await expect(titleInput).toBeVisible()
  await titleInput.fill(title)
  await titleInput.press('Enter')
  // Why: CI can dispatch Enter before React has committed the filled value;
  // blurring exercises the same submit path and makes the helper deterministic.
  try {
    await expect(titleInput).toHaveCount(0, { timeout: 500 })
  } catch {
    await titleInput.evaluateAll(([input]) => (input as HTMLElement | undefined)?.blur())
  }
  await expect(titleInput).toHaveCount(0)
}

async function openTerminalContextMenu(page: Page): Promise<void> {
  const modifiers: ('Alt' | 'Control' | 'Meta' | 'Shift')[] = (await page.evaluate(() =>
    navigator.userAgent.includes('Windows')
  ))
    ? ['Control']
    : []
  const isMac = await page.evaluate(() => navigator.userAgent.includes('Mac'))
  await page
    .locator('.xterm:visible')
    .first()
    .click({
      button: isMac ? 'left' : 'right',
      position: { x: 40, y: 40 },
      modifiers: isMac ? ['Control'] : modifiers
    })
  await expect(page.getByText('Set Title…', { exact: true })).toBeVisible()
}

async function openPaneTitleContextMenu(page: Page, title: string): Promise<void> {
  const modifiers: ('Alt' | 'Control' | 'Meta' | 'Shift')[] = (await page.evaluate(() =>
    navigator.userAgent.includes('Windows')
  ))
    ? ['Control']
    : []
  const isMac = await page.evaluate(() => navigator.userAgent.includes('Mac'))
  const titleBar = page.locator('.pane-title-bar', { hasText: title }).first()
  await expect(titleBar).toBeVisible()
  await titleBar.click({
    button: isMac ? 'left' : 'right',
    position: { x: 20, y: 10 },
    modifiers: isMac ? ['Control'] : modifiers
  })
  await expect(page.getByText('Set Title…', { exact: true })).toBeVisible()
}

async function installDelayedTerminalFocusSteals(
  page: Page,
  delaysMs: readonly number[]
): Promise<void> {
  await page.evaluate((delays) => {
    const focusTerminalAfterTitleFocus = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLInputElement) || !target.classList.contains('pane-title-input')) {
        return
      }
      document.removeEventListener('focusin', focusTerminalAfterTitleFocus, true)
      for (const delay of delays) {
        window.setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
          textarea?.focus()
        }, delay)
      }
    }
    document.addEventListener('focusin', focusTerminalAfterTitleFocus, true)
  }, delaysMs)
}

async function readVisibleXtermContainerBox(
  page: Page
): Promise<{ x: number; y: number; width: number; height: number }> {
  return page
    .locator('.xterm:visible')
    .first()
    .evaluate((xterm) => {
      const container = xterm.closest('.xterm-container')
      if (!(container instanceof HTMLElement)) {
        throw new Error('No visible xterm container found')
      }
      const rect = container.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
}

function expectTerminalToReserveTitleSpace(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number }
): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(1)
  expect(Math.abs(actual.width - expected.width)).toBeLessThan(1)
  expect(actual.y - expected.y).toBeGreaterThan(10)
  expect(expected.height - actual.height).toBeGreaterThan(10)
}

async function expectPaneTitleAttachedToLeaf(
  page: Page,
  title: string,
  leafId: string
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ title, leafId }) => {
            const titleBar = Array.from(
              document.querySelectorAll<HTMLElement>('.pane-title-bar')
            ).find((element) => element.textContent?.includes(title))
            const pane = document.querySelector<HTMLElement>(`.pane[data-leaf-id="${leafId}"]`)
            if (!titleBar || !pane) {
              return false
            }
            const titleRect = titleBar.getBoundingClientRect()
            const paneRect = pane.getBoundingClientRect()
            return (
              Math.abs(titleRect.left - paneRect.left) < 1 &&
              Math.abs(titleRect.top - paneRect.top) < 1 &&
              Math.abs(titleRect.width - paneRect.width) < 1
            )
          },
          { title, leafId }
        ),
      {
        timeout: 5_000,
        message: 'Pane title overlay did not stay attached to its pane'
      }
    )
    .toBe(true)
}

async function getTabCustomTitle(
  page: Page,
  worktreeId: string,
  tabId: string
): Promise<string | null> {
  return page.evaluate(
    ({ targetWorktreeId, targetTabId }) => {
      const state = window.__store!.getState()
      const tab = (state.tabsByWorktree[targetWorktreeId] ?? []).find(
        (entry) => entry.id === targetTabId
      )
      return tab?.customTitle ?? null
    },
    { targetWorktreeId: worktreeId, targetTabId: tabId }
  )
}

async function expectTabCustomTitle(
  page: Page,
  worktreeId: string,
  tabId: string,
  expected: string | null
): Promise<void> {
  await expect
    .poll(() => getTabCustomTitle(page, worktreeId, tabId), { timeout: 3_000 })
    .toBe(expected)
}

async function expectSavedLayoutNotToContainTitle(
  page: Page,
  tabId: string,
  title: string
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ targetTabId, title }) => {
            const layout = window.__store!.getState().terminalLayoutsByTabId[targetTabId]
            return Object.values(layout?.titlesByLeafId ?? {}).includes(title)
          },
          { targetTabId: tabId, title }
        ),
      { timeout: 3_000 }
    )
    .toBe(false)
}

async function readVisiblePaneContents(page: Page): Promise<string[]> {
  const snapshot = await waitForPaneIdentitySnapshot(page, 2)
  return page.evaluate((tabId) => {
    const manager = window.__paneManagers?.get(tabId)
    return (
      manager
        ?.getPanes()
        .map((pane) => pane.serializeAddon?.serialize?.({ scrollback: 200 }) ?? '') ?? []
    )
  }, snapshot.tabId)
}

// Why: only the pointer-drag resize test needs a visible window (pointer
// capture requires a real pointer id). Every other pane operation here is
// driven through the exposed PaneManager API and runs fine headless, so the
// suite itself is not tagged — just the one test that needs it.
// Why: keep the suite serial so when the headful test does run, Playwright
// does not try to open multiple visible Electron windows at once.
test.describe.configure({ mode: 'serial' })
test.describe('Terminal Panes', () => {
  test.beforeEach(async ({ yiruPage }) => {
    await waitForSessionReady(yiruPage)
    await waitForActiveWorktree(yiruPage)
    await ensureTerminalVisible(yiruPage)
    // Why: each test launches a fresh Electron instance. The React tree needs
    // to render Terminal → TabGroupPanel → TerminalPane → useTerminalPaneLifecycle
    // before the PaneManager registers on window.__paneManagers. On cold starts
    // this easily exceeds 5s, so allow up to 30s (well within the 120s test budget)
    // to distinguish "slow cold start" from "environment can't mount panes at all."
    const hasPaneManager = await waitForActiveTerminalManager(yiruPage, 30_000)
      .then(() => true)
      .catch(() => false)
    test.skip(
      !hasPaneManager,
      'Electron automation in this environment never mounts the live TerminalPane manager, so pane split/resize assertions would only fail on harness setup.'
    )
    // Why: hidden Electron runs can report an active terminal tab before the
    // PaneManager finishes mounting the first xterm/PTY pair. Wait for that
    // initial pane so split and content-retention assertions start from a real
    // terminal surface instead of racing the bootstrapped mount.
    await waitForPaneCount(yiruPage, 1, 30_000)
  })

  /**
   * User Prompt:
   * - terminal panes can be split
   */
  test('can split terminal pane right', async ({ yiruPage }) => {
    const paneCountBefore = await countVisibleTerminalPanes(yiruPage)

    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, paneCountBefore + 1)

    const paneCountAfter = await countVisibleTerminalPanes(yiruPage)
    expect(paneCountAfter).toBe(paneCountBefore + 1)
  })

  /**
   * User Prompt:
   * - terminal panes can be split
   */
  test('can split terminal pane down', async ({ yiruPage }) => {
    const paneCountBefore = await countVisibleTerminalPanes(yiruPage)

    await splitActiveTerminalPane(yiruPage, 'horizontal')
    await waitForPaneCount(yiruPage, paneCountBefore + 1)

    const paneCountAfter = await countVisibleTerminalPanes(yiruPage)
    expect(paneCountAfter).toBe(paneCountBefore + 1)
  })

  test('split panes persist PTY bindings by stable UUID leaf id', async ({ yiruPage }) => {
    const paneCountBefore = await countVisibleTerminalPanes(yiruPage)

    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, paneCountBefore + 1)

    const snapshot = await waitForPaneIdentitySnapshot(yiruPage, paneCountBefore + 1)
    const leafIds = snapshot.panes.map((pane) => pane.leafId)
    const ptyIds = snapshot.panes.map((pane) => pane.ptyId)

    expect(new Set(leafIds).size).toBe(leafIds.length)
    expect(new Set(ptyIds).size).toBe(ptyIds.length)
    expect(Object.keys(snapshot.ptyIdsByLeafId).sort()).toEqual([...leafIds].sort())
    expect(Object.keys(snapshot.ptyIdsByLeafId).every((leafId) => UUID_RE.test(leafId))).toBe(true)
    expect(
      snapshot.panes.some(
        (pane) =>
          String(pane.numericPaneId) === pane.leafId || `pane:${pane.numericPaneId}` === pane.leafId
      )
    ).toBe(false)
  })

  test('terminal process receives YIRU_PANE_KEY with the active UUID leaf id', async ({
    yiruPage
  }) => {
    const snapshot = await waitForPaneIdentitySnapshot(yiruPage, 1)
    const activeLeafId = snapshot.activeLeafId ?? snapshot.panes[0]?.leafId
    if (!activeLeafId) {
      throw new Error('No active pane leaf id found')
    }

    const expectedPaneKey = `${snapshot.tabId}:${activeLeafId}`
    const ptyId = await discoverActivePtyId(yiruPage)
    const marker = `YIRU_PANE_KEY_E2E_${Date.now()}`

    await execInTerminal(yiruPage, ptyId, `printf '${marker}=%s\\n' "$YIRU_PANE_KEY"`)
    await waitForTerminalOutput(yiruPage, `${marker}=${expectedPaneKey}`)

    expect(activeLeafId).toMatch(UUID_RE)
  })

  test('terminal context menu copies the stable pane ID', async ({ yiruPage }) => {
    const snapshot = await waitForPaneIdentitySnapshot(yiruPage, 1)
    const leafId = snapshot.panes[0]?.leafId
    if (!leafId) {
      throw new Error('No terminal pane leaf id found')
    }
    const expectedPaneKey = `${snapshot.tabId}:${leafId}`

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Copy Pane ID', { exact: true }).click()

    await expect
      .poll(() => yiruPage.evaluate(() => window.api.ui.readClipboardText()), { timeout: 3_000 })
      .toBe(expectedPaneKey)
    await expect(yiruPage.getByText('Pane ID copied', { exact: true })).toBeVisible()
    expect(leafId).toMatch(UUID_RE)
  })

  test('first Set Title from terminal context menu stays open for typing', async ({ yiruPage }) => {
    const title = `First menu title ${Date.now()}`

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await yiruPage.waitForTimeout(250)
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()

    await titleInput.fill(title)
    await titleInput.press('Enter')

    await expect(titleInput).toHaveCount(0)
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toHaveCount(1)
  })

  test('Set Title editor renders in Yiru overlay while terminal reserves title space', async ({
    yiruPage
  }) => {
    const title = `Reserved overlay title ${Date.now()}`
    const terminalBoxBefore = await readVisibleXtermContainerBox(yiruPage)

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-overlay-layer .pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await expect(yiruPage.getByText('Set Title…', { exact: true })).toBeHidden()
    await expect(yiruPage.locator('.pane .pane-title-input')).toHaveCount(0)
    await expect(yiruPage.locator('.pane[data-has-title]')).toHaveCount(1)
    await expect
      .poll(() =>
        yiruPage
          .locator('.pane-title-bar')
          .first()
          .evaluate((titleBar) => getComputedStyle(titleBar).backgroundColor)
      )
      .not.toBe('rgba(0, 0, 0, 0)')
    const terminalBoxEditing = await readVisibleXtermContainerBox(yiruPage)
    expectTerminalToReserveTitleSpace(terminalBoxEditing, terminalBoxBefore)

    await titleInput.fill(title)
    await titleInput.press('Enter')
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toBeVisible()
    await expect(yiruPage.locator('.pane[data-has-title]')).toHaveCount(1)
    expectTerminalToReserveTitleSpace(
      await readVisibleXtermContainerBox(yiruPage),
      terminalBoxBefore
    )
  })

  test('Set Title context menu opens from the title overlay strip', async ({ yiruPage }) => {
    const title = `Overlay menu title ${Date.now()}`
    const updatedTitle = `Overlay menu updated ${Date.now()}`

    await setPaneTitleFromTerminalMenu(yiruPage, title)
    await openPaneTitleContextMenu(yiruPage, title)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await expect(titleInput).toHaveValue(title)
    await titleInput.fill(updatedTitle)
    await titleInput.press('Enter')

    await expect(yiruPage.locator('.pane-title-text', { hasText: updatedTitle })).toHaveCount(1)
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toHaveCount(0)
  })

  test('Set Title strip activates its pane and accepts file-path drops', async ({ yiruPage }) => {
    const title = `Drop target title ${Date.now()}`
    const droppedPath = `/tmp/title-drop-${Date.now()}.txt`

    await setPaneTitleFromTerminalMenu(yiruPage, title)
    const initialSnapshot = await waitForPaneIdentitySnapshot(yiruPage, 1)
    const titledLeafId = initialSnapshot.activeLeafId ?? initialSnapshot.panes[0]?.leafId
    if (!titledLeafId) {
      throw new Error('No titled pane leaf id found before split')
    }

    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    const splitSnapshot = await waitForPaneIdentitySnapshot(yiruPage, 2)
    const otherPane = splitSnapshot.panes.find((pane) => pane.leafId !== titledLeafId)
    if (!otherPane) {
      throw new Error('No inactive pane found for title-strip drop test')
    }

    await yiruPage.evaluate(
      ({ tabId, paneId }) => {
        window.__paneManagers?.get(tabId)?.setActivePane(paneId, { focus: false })
      },
      { tabId: splitSnapshot.tabId, paneId: otherPane.numericPaneId }
    )
    await expect
      .poll(async () => (await readPaneIdentitySnapshot(yiruPage))?.activeLeafId ?? null)
      .toBe(otherPane.leafId)

    const titleBar = yiruPage.locator('.pane-title-bar', { hasText: title }).first()
    await expect(titleBar).toHaveAttribute('data-native-file-drop-target', 'terminal')
    await expect(titleBar).toHaveAttribute('data-terminal-tab-id', splitSnapshot.tabId)

    await titleBar.evaluate((element, path) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/x-yiru-file-path', path)
      element.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })
      )
      element.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })
      )
    }, droppedPath)

    await expect
      .poll(async () => (await readPaneIdentitySnapshot(yiruPage))?.activeLeafId ?? null, {
        timeout: 5_000,
        message: 'Title-strip drop did not activate the titled pane'
      })
      .toBe(titledLeafId)
    await expect
      .poll(async () => (await getTerminalContent(yiruPage)).includes(droppedPath), {
        timeout: 5_000,
        message: 'Title-strip drop did not paste into the titled pane terminal'
      })
      .toBe(true)
  })

  test('Set Title overlay follows its pane after same-count pane move', async ({ yiruPage }) => {
    const title = `Moved overlay title ${Date.now()}`

    await setPaneTitleFromTerminalMenu(yiruPage, title)
    const initialSnapshot = await waitForPaneIdentitySnapshot(yiruPage, 1)
    const titledLeafId = initialSnapshot.activeLeafId ?? initialSnapshot.panes[0]?.leafId
    if (!titledLeafId) {
      throw new Error('No titled pane leaf id found before move')
    }

    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    const beforeMove = await waitForPaneIdentitySnapshot(yiruPage, 2)
    const target = beforeMove.panes.find((pane) => pane.leafId !== titledLeafId)
    if (!target) {
      throw new Error('No target pane found for titled pane move')
    }
    const beforeOrder = await readTerminalPaneDomLeafOrder(yiruPage)

    await expectPaneTitleAttachedToLeaf(yiruPage, title, titledLeafId)
    await moveTerminalPaneByLeafId(yiruPage, titledLeafId, target.leafId, 'right')

    await expect
      .poll(async () => readTerminalPaneDomLeafOrder(yiruPage), {
        timeout: 10_000,
        message: 'Pane move did not update DOM order'
      })
      .not.toEqual(beforeOrder)
    await expectPaneTitleAttachedToLeaf(yiruPage, title, titledLeafId)
  })

  test('Set Title keeps the pane drag handle available over the title strip', async ({
    yiruPage
  }) => {
    const title = `Draggable title ${Date.now()}`

    await setPaneTitleFromTerminalMenu(yiruPage, title)
    const initialSnapshot = await waitForPaneIdentitySnapshot(yiruPage, 1)
    const titledLeafId = initialSnapshot.activeLeafId ?? initialSnapshot.panes[0]?.leafId
    if (!titledLeafId) {
      throw new Error('No titled pane leaf id found before split')
    }

    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    await expectPaneTitleAttachedToLeaf(yiruPage, title, titledLeafId)

    const titleTopHit = await yiruPage.evaluate(
      ({ title, titledLeafId }) => {
        const titleBar = Array.from(document.querySelectorAll<HTMLElement>('.pane-title-bar')).find(
          (element) => element.textContent?.includes(title)
        )
        const titleDragHandle =
          titleBar.querySelector<HTMLElement>('.pane-title-drag-handle') ?? null
        const pane = document.querySelector<HTMLElement>(`.pane[data-leaf-id="${titledLeafId}"]`)
        if (!titleBar || !pane || !titleDragHandle) {
          return null
        }
        const titleRect = titleBar.getBoundingClientRect()
        const hitElement = document.elementFromPoint(
          titleRect.left + titleRect.width / 2,
          titleRect.top + 4
        )
        return {
          hitDragHandle:
            hitElement instanceof HTMLElement &&
            hitElement.closest('.pane-title-drag-handle') !== null,
          pointerEvents: getComputedStyle(titleDragHandle).pointerEvents,
          titleTop: titleRect.top,
          handleTop: titleDragHandle.getBoundingClientRect().top
        }
      },
      { title, titledLeafId }
    )

    expect(titleTopHit).not.toBeNull()
    expect(titleTopHit?.hitDragHandle).toBe(true)
    expect(titleTopHit?.pointerEvents).toBe('auto')
    expect(Math.abs((titleTopHit?.handleTop ?? 0) - (titleTopHit?.titleTop ?? 0))).toBeLessThan(1)

    await yiruPage.locator('.pane-title-bar', { hasText: title }).click({
      position: { x: 20, y: 18 }
    })
    await expect(yiruPage.locator('.pane-title-input')).toBeVisible()
  })

  test('@headful Set Title pane can be dragged from the title strip', async ({ yiruPage }) => {
    const title = `Dragged title ${Date.now()}`

    await setPaneTitleFromTerminalMenu(yiruPage, title)
    const initialSnapshot = await waitForPaneIdentitySnapshot(yiruPage, 1)
    const titledLeafId = initialSnapshot.activeLeafId ?? initialSnapshot.panes[0]?.leafId
    if (!titledLeafId) {
      throw new Error('No titled pane leaf id found before drag')
    }

    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    const beforeDrag = await waitForPaneIdentitySnapshot(yiruPage, 2)
    const target = beforeDrag.panes.find((pane) => pane.leafId !== titledLeafId)
    if (!target) {
      throw new Error('No target pane found for titled pane drag')
    }
    const beforeOrder = await readTerminalPaneDomLeafOrder(yiruPage)

    const titleDragHandle = yiruPage
      .locator('.pane-title-bar', { hasText: title })
      .locator('.pane-title-drag-handle')
    await expect(titleDragHandle).toBeVisible({ timeout: 3_000 })
    const sourceBox = await titleDragHandle.boundingBox()
    const targetBox = await yiruPage.locator(`.pane[data-leaf-id="${target.leafId}"]`).boundingBox()
    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()
    const sourceIndex = beforeOrder.indexOf(titledLeafId)
    const targetIndex = beforeOrder.indexOf(target.leafId)
    const targetDropX =
      sourceIndex < targetIndex ? targetBox!.x + targetBox!.width - 8 : targetBox!.x + 8

    await yiruPage.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + 4)
    await yiruPage.mouse.down()
    await yiruPage.mouse.move(targetDropX, targetBox!.y + targetBox!.height / 2, {
      steps: 20
    })
    await yiruPage.mouse.up()

    await expect
      .poll(async () => readTerminalPaneDomLeafOrder(yiruPage), {
        timeout: 10_000,
        message: 'Title-strip pane drag did not update DOM order'
      })
      .not.toEqual(beforeOrder)
    const afterDrag = await waitForPaneIdentitySnapshot(yiruPage, 2)
    expect(afterDrag.panes.map((pane) => pane.leafId).sort()).toEqual(
      beforeDrag.panes.map((pane) => pane.leafId).sort()
    )
    await expectPaneTitleAttachedToLeaf(yiruPage, title, titledLeafId)
  })

  test('Set Title input stays open when clicked in a split terminal', async ({ yiruPage }) => {
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    await splitActiveTerminalPane(yiruPage, 'horizontal')
    await waitForPaneCount(yiruPage, 3)

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()

    // Why: overlay controls own the title strip. Clicking the already-open
    // title input must not leak through to xterm and flash the editor closed.
    await titleInput.evaluate((input) => {
      const pointerInit: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse'
      }
      input.dispatchEvent(new PointerEvent('pointerdown', pointerInit))
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      input.dispatchEvent(new PointerEvent('pointerup', pointerInit))
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await expect
      .poll(
        () => titleInput.evaluate((input) => input.isConnected && document.activeElement === input),
        { timeout: 1_000 }
      )
      .toBe(true)

    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
  })

  test('Set Title survives an early blur during first focus handoff', async ({ yiruPage }) => {
    await openTerminalContextMenu(yiruPage)
    await yiruPage.evaluate(() => {
      const blurOnFirstTitleFocus = (event: FocusEvent): void => {
        const target = event.target
        if (
          !(target instanceof HTMLInputElement) ||
          !target.classList.contains('pane-title-input')
        ) {
          return
        }
        document.removeEventListener('focusin', blurOnFirstTitleFocus, true)
        queueMicrotask(() => target.blur())
      }
      document.addEventListener('focusin', blurOnFirstTitleFocus, true)
    })
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await yiruPage.waitForTimeout(250)
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
  })

  test('Set Title survives delayed terminal focus handoffs', async ({ yiruPage }) => {
    await openTerminalContextMenu(yiruPage)
    await installDelayedTerminalFocusSteals(yiruPage, [50, 150, 300])
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await yiruPage.waitForTimeout(600)
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
  })

  test('Set Title survives delayed terminal focus handoffs in a split pane', async ({
    yiruPage
  }) => {
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)

    await openTerminalContextMenu(yiruPage)
    await installDelayedTerminalFocusSteals(yiruPage, [50, 150, 300])
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await yiruPage.waitForTimeout(600)
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
  })

  test('Set Title preserves draft text across terminal focus steals', async ({ yiruPage }) => {
    const draftTitle = `Draft title ${Date.now()}`

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await titleInput.fill(draftTitle)

    await yiruPage.evaluate(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
      textarea?.focus()
    })

    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await expect(titleInput).toHaveValue(draftTitle)
  })

  test('Set Title does not submit when synthetic focus restore fails', async ({ yiruPage }) => {
    const draftTitle = `Blocked focus title ${Date.now()}`

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await titleInput.fill(draftTitle)
    await titleInput.evaluate((input) => {
      input.focus = () => {}
    })

    await yiruPage.evaluate(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
      textarea?.focus()
    })

    await expect(titleInput).toBeVisible()
    await expect(titleInput).toHaveValue(draftTitle)
    await expect(yiruPage.locator('.pane-title-text', { hasText: draftTitle })).toHaveCount(0)
  })

  test('Set Title still commits by blur after synthetic terminal focus steals', async ({
    yiruPage
  }) => {
    const title = `Post steal blur title ${Date.now()}`

    await openTerminalContextMenu(yiruPage)
    await installDelayedTerminalFocusSteals(yiruPage, [50, 150])
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await yiruPage.waitForTimeout(300)
    await titleInput.fill(title)
    await yiruPage
      .locator('.xterm:visible')
      .first()
      .click({ position: { x: 40, y: 60 } })

    await expect(titleInput).toHaveCount(0)
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toHaveCount(1)
  })

  test('Set Title commits when tabbing away from the title input', async ({ yiruPage }) => {
    const title = `Tab commit title ${Date.now()}`

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await titleInput.fill(title)
    await titleInput.press('Tab')

    await expect(titleInput).toHaveCount(0)
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toHaveCount(1)
  })

  test('Set Title overlay hides with its inactive terminal tab', async ({ yiruPage }) => {
    const title = `Hidden tab title ${Date.now()}`
    const worktreeId = (await getActiveWorktreeId(yiruPage))!

    await setPaneTitleFromTerminalMenu(yiruPage, title)
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toBeVisible()

    await pressShortcut(yiruPage, 't')
    await expect
      .poll(async () => (await getWorktreeTabs(yiruPage, worktreeId)).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toBeHidden()

    await pressShortcut(yiruPage, 'BracketLeft', { shift: true })
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toBeVisible()
  })

  test('Set Title still commits by blur after focus settles', async ({ yiruPage }) => {
    const title = `Blur commit title ${Date.now()}`

    await openTerminalContextMenu(yiruPage)
    await yiruPage.getByText('Set Title…', { exact: true }).click()

    const titleInput = yiruPage.locator('.pane-title-input').first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeFocused()
    await yiruPage.waitForTimeout(100)
    await titleInput.fill(title)
    await yiruPage
      .locator('.xterm:visible')
      .first()
      .click({ position: { x: 40, y: 60 } })

    await expect(titleInput).toHaveCount(0)
    await expect(yiruPage.locator('.pane-title-text', { hasText: title })).toHaveCount(1)
  })

  test('Always-on pane header split button hover stays transparent', async ({ yiruPage }) => {
    const splitButton = yiruPage.getByRole('button', { name: 'Split Terminal Right' })
    await expect(splitButton).toBeVisible()
    await splitButton.hover()

    const hoverStyle = await splitButton.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        backgroundColor: style.backgroundColor,
        opacity: style.opacity
      }
    })

    expect(hoverStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(Number(hoverStyle.opacity)).toBeGreaterThan(0.9)
  })

  test('Set Title stays pane-local during agent title churn', async ({ yiruPage }) => {
    const worktreeId = (await getActiveWorktreeId(yiruPage))!
    const tabId = (await getActiveTabId(yiruPage))!
    const paneTitle = `Codex pane ${Date.now()}`
    const removeButtonTitle = `Remove button label ${Date.now()}`
    const splitTitle = `Split label ${Date.now()}`
    const runtimeTitle = '⠋ Codex working'

    await setPaneTitleFromTerminalMenu(yiruPage, paneTitle)
    await expect(yiruPage.locator('.pane-title-text', { hasText: paneTitle })).toBeVisible()
    await expectTabCustomTitle(yiruPage, worktreeId, tabId, null)

    await yiruPage.getByRole('button', { name: `Edit pane title: ${paneTitle}` }).focus()
    await yiruPage.keyboard.press('Enter')
    const paneTitleInput = yiruPage.getByRole('textbox', { name: 'Pane title' })
    await expect(paneTitleInput).toBeVisible()
    await expect(paneTitleInput).toBeFocused()
    await yiruPage.keyboard.press('Escape')
    await expect(paneTitleInput).toHaveCount(0)
    await expect(yiruPage.locator('.pane-title-text', { hasText: paneTitle })).toBeVisible()

    await yiruPage.evaluate(
      ({ targetTabId, title }) => {
        window.__store!.getState().updateTabTitle(targetTabId, title)
      },
      { targetTabId: tabId, title: runtimeTitle }
    )

    // Why: active agents continuously write OSC titles. Set Title is Yiru's
    // pane-local overlay and must remain visible while the tab runtime title
    // continues to follow the active PTY.
    await expect(yiruPage.locator('.pane-title-text', { hasText: paneTitle })).toBeVisible()
    await expect(
      yiruPage.locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
    ).toHaveAttribute('data-tab-title', runtimeTitle)
    await expectTabCustomTitle(yiruPage, worktreeId, tabId, null)

    await setPaneTitleFromTerminalMenu(yiruPage, '')
    await expect(yiruPage.locator('.pane-title-text', { hasText: paneTitle })).toBeHidden()
    await expectSavedLayoutNotToContainTitle(yiruPage, tabId, paneTitle)

    await setPaneTitleFromTerminalMenu(yiruPage, removeButtonTitle)
    await setPaneTitleFromTerminalMenu(yiruPage, '')
    await expect(yiruPage.locator('.pane-title-text', { hasText: removeButtonTitle })).toBeHidden()
    await expectSavedLayoutNotToContainTitle(yiruPage, tabId, removeButtonTitle)

    await setPaneTitleFromTerminalMenu(yiruPage, splitTitle)
    await expectTabCustomTitle(yiruPage, worktreeId, tabId, null)

    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    await expect(yiruPage.locator('.pane-title-text', { hasText: splitTitle })).toBeVisible()

    await yiruPage.evaluate(
      ({ targetTabId, title }) => {
        window.__store!.getState().updateTabTitle(targetTabId, title)
      },
      { targetTabId: tabId, title: runtimeTitle }
    )
    await expect(
      yiruPage.locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
    ).toHaveAttribute('data-tab-title', runtimeTitle)
  })

  test('closing a split pane prunes its leaf-keyed PTY binding without remapping siblings', async ({
    yiruPage
  }) => {
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    await splitActiveTerminalPane(yiruPage, 'horizontal')
    await waitForPaneCount(yiruPage, 3)

    const beforeClose = await waitForPaneIdentitySnapshot(yiruPage, 3)
    const closedLeafId = beforeClose.activeLeafId ?? beforeClose.panes.at(-1)?.leafId
    if (!closedLeafId) {
      throw new Error('No active split pane leaf id found before close')
    }
    const survivingLeafIds = beforeClose.panes
      .map((pane) => pane.leafId)
      .filter((leafId) => leafId !== closedLeafId)

    await closeActiveTerminalPane(yiruPage)
    await waitForPaneCount(yiruPage, 2)

    const afterClose = await waitForPaneIdentitySnapshot(yiruPage, 2)
    expect(afterClose.panes.map((pane) => pane.leafId).sort()).toEqual(survivingLeafIds.sort())
    expect(Object.keys(afterClose.ptyIdsByLeafId).sort()).toEqual(survivingLeafIds.sort())
    expect(afterClose.ptyIdsByLeafId[closedLeafId]).toBeUndefined()
  })

  test('closing and remaking right/down splits keeps surviving leaf-keyed bindings stable', async ({
    yiruPage
  }) => {
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    await splitActiveTerminalPane(yiruPage, 'horizontal')
    await waitForPaneCount(yiruPage, 3)

    const beforeClose = await waitForPaneIdentitySnapshot(yiruPage, 3)
    const closedLeafId = beforeClose.activeLeafId ?? beforeClose.panes.at(-1)?.leafId
    if (!closedLeafId) {
      throw new Error('No active split pane leaf id found before close/remake')
    }
    const survivingBindings = Object.fromEntries(
      beforeClose.panes
        .filter((pane) => pane.leafId !== closedLeafId)
        .map((pane) => [pane.leafId, pane.ptyId])
    )

    await closeActiveTerminalPane(yiruPage)
    await waitForPaneCount(yiruPage, 2)

    const afterClose = await waitForPaneIdentitySnapshot(yiruPage, 2)
    expect(Object.keys(afterClose.ptyIdsByLeafId).sort()).toEqual(
      Object.keys(survivingBindings).sort()
    )
    for (const [leafId, ptyId] of Object.entries(survivingBindings)) {
      expect(afterClose.ptyIdsByLeafId[leafId]).toBe(ptyId)
    }
    expect(afterClose.ptyIdsByLeafId[closedLeafId]).toBeUndefined()

    await splitActiveTerminalPane(yiruPage, 'horizontal')
    await waitForPaneCount(yiruPage, 3)

    const afterRemake = await waitForPaneIdentitySnapshot(yiruPage, 3)
    const remadeLeafIds = afterRemake.panes.map((pane) => pane.leafId)
    expect(remadeLeafIds).not.toContain(closedLeafId)
    for (const [leafId, ptyId] of Object.entries(survivingBindings)) {
      expect(afterRemake.ptyIdsByLeafId[leafId]).toBe(ptyId)
    }
    expect(new Set(remadeLeafIds).size).toBe(3)
  })

  test('moving panes through the drag-drop handler preserves leaf-keyed PTY bindings', async ({
    yiruPage
  }) => {
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    await splitActiveTerminalPane(yiruPage, 'horizontal')
    await waitForPaneCount(yiruPage, 3)

    const beforeMove = await waitForPaneIdentitySnapshot(yiruPage, 3)
    const beforeOrder = await readTerminalPaneDomLeafOrder(yiruPage)
    const source = beforeMove.panes.at(-1)
    const target = beforeMove.panes[0]
    if (!source || !target) {
      throw new Error('Need source and target panes for move test')
    }
    const bindingsBefore = { ...beforeMove.ptyIdsByLeafId }

    await moveTerminalPaneByLeafId(yiruPage, source.leafId, target.leafId, 'left')

    await expect
      .poll(async () => readTerminalPaneDomLeafOrder(yiruPage), {
        timeout: 10_000,
        message: 'Pane drag-drop move did not update DOM order'
      })
      .not.toEqual(beforeOrder)

    const afterMove = await waitForPaneIdentitySnapshot(yiruPage, 3)
    const afterLeafIds = afterMove.panes.map((pane) => pane.leafId).sort()
    expect(afterLeafIds).toEqual(beforeMove.panes.map((pane) => pane.leafId).sort())
    expect(afterMove.ptyIdsByLeafId).toEqual(bindingsBefore)
  })

  /**
   * User Prompt:
   * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
   */
  test('terminal pane retains content when switching tabs and back', async ({ yiruPage }) => {
    // Write a unique marker to the current terminal
    const ptyId = await discoverActivePtyId(yiruPage)
    const marker = `RETAIN_TEST_${Date.now()}`
    await execInTerminal(yiruPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(yiruPage, marker)

    // Create a new terminal tab (Cmd/Ctrl+T) to switch away
    const worktreeId = (await getActiveWorktreeId(yiruPage))!
    await pressShortcut(yiruPage, 't')

    // Wait for the new tab to appear
    await expect
      .poll(async () => (await getWorktreeTabs(yiruPage, worktreeId)).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)

    // Verify we're still on a terminal tab
    const activeType = await getActiveTabType(yiruPage)
    expect(activeType).toBe('terminal')

    // Switch back to the previous tab with Cmd/Ctrl+Shift+[
    await pressShortcut(yiruPage, 'BracketLeft', { shift: true })

    // Verify the marker is still present
    await expect
      .poll(async () => (await getTerminalContent(yiruPage)).includes(marker), { timeout: 5_000 })
      .toBe(true)

    // Clean up the extra tab
    await pressShortcut(yiruPage, 'BracketRight', { shift: true })
    await pressShortcut(yiruPage, 'w')
  })

  /**
   * User Prompt:
   * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
   */
  test('terminal pane retains content when splitting and closing a pane', async ({ yiruPage }) => {
    // Write a unique marker to the current terminal
    const ptyId = await discoverActivePtyId(yiruPage)
    const marker = `SPLIT_RETAIN_${Date.now()}`
    await execInTerminal(yiruPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(yiruPage, marker)

    const panesBefore = await countVisibleTerminalPanes(yiruPage)

    // Split the terminal right
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, panesBefore + 1)

    await focusLastTerminalPane(yiruPage)
    await closeActiveTerminalPane(yiruPage)
    await waitForPaneCount(yiruPage, panesBefore)

    // The original pane should still have our marker
    await expect
      .poll(async () => (await getTerminalContent(yiruPage)).includes(marker), { timeout: 5_000 })
      .toBe(true)
  })

  /**
   * User Prompt:
   * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
   */
  test('terminal pane retains content when switching worktrees and back', async ({ yiruPage }) => {
    const allWorktreeIds = await getAllWorktreeIds(yiruPage)
    if (allWorktreeIds.length < 2) {
      test.skip(true, 'Need at least 2 worktrees to test worktree switching')
      return
    }

    const worktreeId = (await getActiveWorktreeId(yiruPage))!

    // Write a unique marker to the current terminal
    const ptyId = await discoverActivePtyId(yiruPage)
    const marker = `WT_RETAIN_${Date.now()}`
    await execInTerminal(yiruPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(yiruPage, marker)

    // Switch to a different worktree via the store
    const otherId = await switchToOtherWorktree(yiruPage, worktreeId)
    expect(otherId).not.toBeNull()
    await expect.poll(async () => getActiveWorktreeId(yiruPage), { timeout: 5_000 }).toBe(otherId)

    // Switch back to the original worktree
    await switchToWorktree(yiruPage, worktreeId)
    await expect
      .poll(async () => getActiveWorktreeId(yiruPage), { timeout: 5_000 })
      .toBe(worktreeId)

    // Why: after a worktree round-trip, the split-group container transitions
    // from hidden back to visible. In headful Electron runs the terminal tree
    // can take longer than a single render turn to rebind its serialize addon
    // after the worktree activation cascade. Waiting directly for the retained
    // marker proves the user-visible behavior without failing early on the
    // intermediate manager-remount timing.
    await ensureTerminalVisible(yiruPage)

    // The terminal should still contain our marker
    await expect
      .poll(async () => (await getTerminalContent(yiruPage)).includes(marker), { timeout: 20_000 })
      .toBe(true)
  })

  /**
   * User Prompt:
   * - resizing terminal panes works
   */
  test('shows a pane divider after splitting', async ({ yiruPage }) => {
    // Why: headless Playwright cannot exercise the real pointer-capture resize
    // path reliably, so the default suite only verifies the precondition for
    // resizing: splitting creates a visible divider for the active layout.
    const panesBefore = await countVisibleTerminalPanes(yiruPage)
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, panesBefore + 1)

    await expect(yiruPage.locator('.pane-divider.is-vertical').first()).toBeVisible({
      timeout: 3_000
    })
  })

  /**
   * User Prompt:
   * - resizing terminal panes works (headful variant)
   *
   * Why this test must be headful: the pane divider's drag handler calls
   * setPointerCapture(e.pointerId) on pointerdown. Pointer capture requires
   * a valid pointer ID from a real pointing-device event, which Playwright's
   * mouse API only produces when the Electron window is visible. In headless
   * mode setPointerCapture silently fails, pointermove never fires on the
   * divider, and the resize has no effect. Run with:
   *   YIRU_E2E_HEADFUL=1 pnpm run test:e2e
   */
  test('@headful can resize terminal panes by real mouse drag', async ({ yiruPage }) => {
    // Split the terminal to create a resizable divider
    const panesBefore = await countVisibleTerminalPanes(yiruPage)
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, panesBefore + 1)

    // Get the pane widths before resize
    const paneWidthsBefore = await yiruPage.evaluate(() => {
      const xterms = document.querySelectorAll('.xterm')
      return Array.from(xterms)
        .filter((x) => (x as HTMLElement).offsetParent !== null)
        .map((x) => (x as HTMLElement).getBoundingClientRect().width)
    })
    expect(paneWidthsBefore.length).toBeGreaterThanOrEqual(2)

    // Find the vertical pane divider and drag it
    const divider = yiruPage.locator('.pane-divider.is-vertical').first()
    await expect(divider).toBeVisible({ timeout: 3_000 })
    const box = await divider.boundingBox()
    expect(box).not.toBeNull()

    // Drag the divider 150px to the right to resize panes
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await yiruPage.mouse.move(startX, startY)
    await yiruPage.mouse.down()
    await yiruPage.mouse.move(startX + 150, startY, { steps: 20 })
    await yiruPage.mouse.up()

    // Verify pane widths changed
    await expect
      .poll(
        async () => {
          const widthsAfter = await yiruPage.evaluate(() => {
            const xterms = document.querySelectorAll('.xterm')
            return Array.from(xterms)
              .filter((x) => (x as HTMLElement).offsetParent !== null)
              .map((x) => (x as HTMLElement).getBoundingClientRect().width)
          })
          if (widthsAfter.length < 2) {
            return false
          }

          return paneWidthsBefore.some((w, i) => Math.abs(w - widthsAfter[i]) > 20)
        },
        { timeout: 5_000, message: 'Pane widths did not change after dragging divider' }
      )
      .toBe(true)
  })

  test('@headful resizing split panes forwards only the settled PTY size', async ({ yiruPage }) => {
    await splitActiveTerminalPane(yiruPage, 'vertical')
    const snapshot = await waitForPaneIdentitySnapshot(yiruPage, 2)
    const ptyIds = snapshot.panes
      .map((pane) => pane.ptyId)
      .filter((ptyId): ptyId is string => Boolean(ptyId))

    for (const ptyId of ptyIds) {
      await sendToTerminal(
        yiruPage,
        ptyId,
        "export PS1='ISSUE2910_PROMPT$ '; export PROMPT=\"$PS1\"; trap 'printf \"\\nISSUE2910_WINCH\\n\"' WINCH; clear; printf 'ISSUE2910_READY\\n'\r"
      )
    }

    await expect
      .poll(
        async () =>
          (await readVisiblePaneContents(yiruPage)).every((content) =>
            content.includes('ISSUE2910_READY')
          ),
        { timeout: 10_000, message: 'Split panes did not receive resize-regression prompt setup' }
      )
      .toBe(true)

    const divider = yiruPage.locator('.pane-divider.is-vertical').first()
    await expect(divider).toBeVisible({ timeout: 3_000 })
    const box = await divider.boundingBox()
    expect(box).not.toBeNull()

    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await yiruPage.mouse.move(startX, startY)
    await yiruPage.mouse.down()
    await yiruPage.mouse.move(startX - 350, startY, { steps: 40 })
    await yiruPage.mouse.move(startX + 250, startY, { steps: 40 })
    await yiruPage.mouse.up()
    await yiruPage.waitForTimeout(500)

    const paneContents = await readVisiblePaneContents(yiruPage)
    for (const content of paneContents) {
      const promptRedraws = content.match(/ISSUE2910_PROMPT/g)?.length ?? 0
      const winchNotifications = content.match(/ISSUE2910_WINCH/g)?.length ?? 0
      expect(promptRedraws).toBeLessThanOrEqual(3)
      expect(winchNotifications).toBeLessThanOrEqual(1)
    }
  })

  test('@headful dragging terminal panes around preserves leaf-keyed PTY bindings', async ({
    yiruPage
  }) => {
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, 2)
    await splitActiveTerminalPane(yiruPage, 'horizontal')
    await waitForPaneCount(yiruPage, 3)

    const beforeDrag = await waitForPaneIdentitySnapshot(yiruPage, 3)
    const beforeOrder = await readTerminalPaneDomLeafOrder(yiruPage)
    const source = beforeDrag.panes.at(-1)
    const target = beforeDrag.panes[0]
    if (!source || !target) {
      throw new Error('Need source and target panes for drag test')
    }

    const sourceHandle = yiruPage.locator(
      `.pane[data-leaf-id="${source.leafId}"] .pane-drag-handle`
    )
    await expect(sourceHandle).toBeVisible({ timeout: 3_000 })
    const sourceBox = await sourceHandle.boundingBox()
    const targetBox = await yiruPage.locator(`.pane[data-leaf-id="${target.leafId}"]`).boundingBox()
    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()

    await yiruPage.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + 4)
    await yiruPage.mouse.down()
    await yiruPage.mouse.move(targetBox!.x + 8, targetBox!.y + targetBox!.height / 2, {
      steps: 20
    })
    await yiruPage.mouse.up()

    await expect
      .poll(async () => readTerminalPaneDomLeafOrder(yiruPage), {
        timeout: 10_000,
        message: 'Real pane drag did not update DOM order'
      })
      .not.toEqual(beforeOrder)

    const afterDrag = await waitForPaneIdentitySnapshot(yiruPage, 3)
    expect(afterDrag.panes.map((pane) => pane.leafId).sort()).toEqual(
      beforeDrag.panes.map((pane) => pane.leafId).sort()
    )
    expect(afterDrag.ptyIdsByLeafId).toEqual(beforeDrag.ptyIdsByLeafId)
  })

  /**
   * User Prompt:
   * - closing panes works
   */
  test('closing a split pane removes it and remaining pane fills space', async ({ yiruPage }) => {
    const panesBefore = await countVisibleTerminalPanes(yiruPage)

    // Split the terminal
    await splitActiveTerminalPane(yiruPage, 'vertical')
    await waitForPaneCount(yiruPage, panesBefore + 1)

    const panesAfterSplit = await countVisibleTerminalPanes(yiruPage)
    expect(panesAfterSplit).toBeGreaterThanOrEqual(2)

    await closeActiveTerminalPane(yiruPage)
    await waitForPaneCount(yiruPage, panesAfterSplit - 1)

    // The remaining pane should fill the available space
    const paneWidth = await yiruPage.evaluate(() => {
      const xterms = document.querySelectorAll('.xterm')
      const visible = Array.from(xterms).find(
        (x) => (x as HTMLElement).offsetParent !== null
      ) as HTMLElement | null
      return visible?.getBoundingClientRect().width ?? 0
    })
    // Why: threshold is kept low to account for headless mode where the
    // window is 1200px wide (not maximized) and the sidebar takes space.
    expect(paneWidth).toBeGreaterThan(200)
  })
})
