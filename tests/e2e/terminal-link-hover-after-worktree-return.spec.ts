import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './helpers/yiru-app'
import {
  ensureTerminalVisible,
  getAllWorktreeIds,
  switchToWorktree,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import {
  getTerminalContent,
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'
import { nodeTerminalCommand } from './terminal-node-command'
import { waitForPtyShellEcho } from './terminal-pty-readiness'

/**
 * Repro for: a clickable terminal link (file path, URL, …) becomes dead after
 * switching to another worktree and returning, until the user scrolls the
 * terminal a little.
 *
 * xterm's Linkifier only re-runs link providers on mousemove when the hovered
 * buffer cell changes vs its `_lastBufferCell` cache. Hiding the surface fires
 * mouseleave (clearing the current link) but leaves that cache, so returning
 * the pointer to the same cell short-circuits and the link is never
 * re-established — `currentLink` stays null. File-path links are the worst case
 * because their geometry click fallback does not compensate after reveal.
 */
type HoverProbe = { col: number; row: number; tabId: string }

async function locateHoverProbe(page: Page, needle: string): Promise<HoverProbe | null> {
  return page.evaluate((needle) => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId ?? null
    const tabId =
      state?.activeTabType === 'terminal'
        ? (state?.activeTabId ?? null)
        : worktreeId
          ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
          : null
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    if (!tabId || !pane) {
      throw new Error('active terminal pane unavailable')
    }
    const terminal = pane.terminal
    const buffer = terminal.buffer.active
    let hit: { row: number; col: number } | null = null
    for (let row = 0; row < terminal.rows; row += 1) {
      const line = buffer.getLine(buffer.viewportY + row)
      if (!line) {
        continue
      }
      const text = line.translateToString(true)
      // Why: interactive shells can echo the typed command before their delayed
      // prompt settles; the standalone stdout line gives the probe stable geometry.
      if (text.trim() !== needle) {
        continue
      }
      const idx = text.indexOf(needle)
      if (idx >= 0) {
        hit = { row, col: idx }
        break
      }
    }
    if (!hit) {
      return null
    }
    const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen')
    if (!screen) {
      throw new Error('xterm-screen element unavailable')
    }
    // Aim at the middle of the link text so the pointer lands squarely inside
    // the link range regardless of rounding.
    return {
      col: hit.col + Math.floor(needle.length / 2),
      row: hit.row,
      tabId
    }
  }, needle)
}

async function waitForHoverProbe(page: Page, needle: string): Promise<HoverProbe> {
  let probe: HoverProbe | null = null
  await expect
    .poll(
      async () => {
        probe = await locateHoverProbe(page, needle)
        return probe
      },
      { timeout: 10_000, message: 'standalone link output did not settle in the terminal' }
    )
    .not.toBeNull()
  if (!probe) {
    throw new Error('standalone link output did not settle in the terminal')
  }
  return probe
}

/**
 * Dispatch a hover mousemove at the probe coordinates and return the text of
 * the link the linkifier considers active (or null). Callers poll this because
 * Yiru's file-path provider resolves link candidates asynchronously.
 */
async function hoverAndReadActiveLinkText(page: Page, probe: HoverProbe): Promise<string | null> {
  const dispatched = await page.evaluate(({ col, row, tabId }) => {
    const manager = window.__paneManagers?.get(tabId)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const screen = pane?.terminal.element?.querySelector<HTMLElement>('.xterm-screen')
    if (!pane || !screen) {
      return false
    }
    const rect = screen.getBoundingClientRect()
    const clientX = rect.left + (col + 0.5) * (rect.width / pane.terminal.cols)
    const clientY = rect.top + (row + 0.5) * (rect.height / pane.terminal.rows)
    screen.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX, clientY })
    )
    return true
  }, probe)
  if (!dispatched) {
    return null
  }
  return page.evaluate(({ tabId }) => {
    const manager = window.__paneManagers?.get(tabId)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const core = pane?.terminal as unknown as
      | { _core?: { linkifier?: { currentLink?: { link?: { text?: string } } } } }
      | undefined
    return core?._core?.linkifier?.currentLink?.link?.text ?? null
  }, probe)
}

async function isTerminalSurfaceVisible(page: Page, tabId: string): Promise<boolean> {
  return page.evaluate((tabId) => {
    const manager = window.__paneManagers?.get(tabId)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const screen = pane?.terminal.element?.querySelector<HTMLElement>('.xterm-screen')
    return Boolean(
      pane?.container.isConnected &&
      pane.container.getClientRects().length > 0 &&
      screen?.isConnected &&
      screen.getClientRects().length > 0
    )
  }, tabId)
}

async function switchAwayFromProbe(
  page: Page,
  targetWorktreeId: string,
  probe: HoverProbe
): Promise<void> {
  await expect
    .poll(
      async () => {
        const targetActive = await page.evaluate((targetWorktreeId) => {
          const store = window.__store
          if (!store) {
            return false
          }
          if (store.getState().activeWorktreeId !== targetWorktreeId) {
            store.getState().setActiveWorktree(targetWorktreeId)
          }
          return store.getState().activeWorktreeId === targetWorktreeId
        }, targetWorktreeId)
        return targetActive && !(await isTerminalSurfaceVisible(page, probe.tabId))
      },
      { timeout: 30_000, message: 'original terminal did not hide on worktree switch' }
    )
    .toBe(true)
}

async function restoreProbeSurface(
  page: Page,
  args: { worktreeId: string; needle: string; probe: HoverProbe }
): Promise<boolean> {
  return page.evaluate(({ worktreeId, needle, probe }) => {
    const store = window.__store
    if (!store) {
      return false
    }
    let state = store.getState()
    if (state.activeWorktreeId !== worktreeId) {
      state.setActiveWorktree(worktreeId)
      return false
    }
    if (state.activeTabId !== probe.tabId || state.activeTabType !== 'terminal') {
      const tabStillExists = (state.tabsByWorktree[worktreeId] ?? []).some(
        (tab) => tab.id === probe.tabId
      )
      if (!tabStillExists) {
        return false
      }
      state.setActiveTab(probe.tabId)
      state = store.getState()
    }
    const manager = window.__paneManagers?.get(probe.tabId)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const screen = pane?.terminal.element?.querySelector<HTMLElement>('.xterm-screen')
    if (
      !pane ||
      !screen?.isConnected ||
      screen.getClientRects().length === 0 ||
      state.activeWorktreeId !== worktreeId
    ) {
      return false
    }
    const text = pane.terminal.buffer.active
      .getLine(pane.terminal.buffer.active.viewportY + probe.row)
      ?.translateToString(true)
    const linkStart = text?.indexOf(needle) ?? -1
    return text?.trim() === needle && linkStart + Math.floor(needle.length / 2) === probe.col
  }, args)
}

async function activateHoveredLink(page: Page, probe: HoverProbe): Promise<void> {
  await page.evaluate(({ col, row, tabId }) => {
    const manager = window.__paneManagers?.get(tabId)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const screen = pane?.terminal.element?.querySelector<HTMLElement>('.xterm-screen')
    if (!pane || !screen) {
      throw new Error('xterm-screen element unavailable')
    }
    const rect = screen.getBoundingClientRect()
    const clientX = rect.left + (col + 0.5) * (rect.width / pane.terminal.cols)
    const clientY = rect.top + (row + 0.5) * (rect.height / pane.terminal.rows)
    const isMac = navigator.userAgent.includes('Mac')
    const modifier = { metaKey: isMac, ctrlKey: !isMac }
    screen.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
        ...modifier
      })
    )
    screen.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
        ...modifier
      })
    )
  }, probe)
}

async function dispatchScreenMouseLeave(page: Page, tabId: string): Promise<void> {
  await page.evaluate((tabId) => {
    const manager = window.__paneManagers?.get(tabId)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const screen = pane?.terminal.element?.querySelector<HTMLElement>('.xterm-screen')
    // Mimics the pointer leaving as the surface hides on a worktree switch:
    // clears the linkifier's current link but keeps its cell cache.
    screen?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: true }))
  }, tabId)
}

async function activeWorktreePath(page: Page): Promise<string> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    const id = state?.activeWorktreeId
    return (
      Object.values(state?.worktreesByRepo ?? {})
        .flat()
        .find((w) => w.id === id)?.path ?? ''
    )
  })
}

async function writeStableLinkFixture(page: Page, ptyId: string, text: string): Promise<void> {
  // Why: shell prompts redraw asynchronously and move earlier echo output.
  // Keep the target at one fixed cell while the worktree is hidden and restored.
  const script =
    "process.stdout.write('\\x1b[2J\\x1b[H' + process.argv[1]); setInterval(() => {}, 1000)"
  await sendToTerminal(page, ptyId, `${nodeTerminalCommand(['-e', script, text])}\r`)
}

/**
 * Drive the full repro and assert the link re-establishes on hover after
 * returning to the worktree. `contains` accommodates the file provider's
 * display text differing slightly from the raw echoed token.
 */
async function assertLinkRecoversAfterReturn(
  page: Page,
  args: {
    firstWorktreeId: string
    secondWorktreeId: string
    needle: string
    expectContains: string
  }
): Promise<HoverProbe> {
  const probe = await waitForHoverProbe(page, args.needle)

  // Baseline: hovering establishes the link before any switch.
  await expect
    .poll(() => hoverAndReadActiveLinkText(page, probe), {
      timeout: 5_000,
      message: 'baseline hover never established the link'
    })
    .toContain(args.expectContains)

  await dispatchScreenMouseLeave(page, probe.tabId)
  await switchToWorktree(page, args.secondWorktreeId)
  await switchAwayFromProbe(page, args.secondWorktreeId, probe)
  await waitForActiveTerminalManager(page, 30_000)

  await switchToWorktree(page, args.firstWorktreeId)
  await ensureTerminalVisible(page)
  const probeSurfaceArgs = {
    worktreeId: args.firstWorktreeId,
    needle: args.needle,
    probe
  }
  await expect
    .poll(() => restoreProbeSurface(page, probeSurfaceArgs), {
      timeout: 30_000,
      message: 'original terminal probe did not settle after returning'
    })
    .toBe(true)

  // Hover the SAME cell without scrolling. Pre-fix this never re-establishes
  // the link (dead until a scroll); post-fix the reveal reset re-linkifies.
  await expect
    .poll(
      async () => {
        const surfaceReady = await restoreProbeSurface(page, probeSurfaceArgs)
        return surfaceReady ? hoverAndReadActiveLinkText(page, probe) : null
      },
      {
        timeout: 15_000,
        message: 'link did not re-establish on hover after returning to the worktree'
      }
    )
    .toContain(args.expectContains)

  return probe
}

test.describe('Terminal link hover after worktree return', () => {
  test.beforeEach(async ({ yiruPage }) => {
    await waitForSessionReady(yiruPage)
  })

  test('re-establishes a file-path link on hover after switching worktrees and back', async ({
    yiruPage
  }) => {
    const firstWorktreeId = await waitForActiveWorktree(yiruPage)
    const secondWorktreeId = (await getAllWorktreeIds(yiruPage)).find(
      (id) => id !== firstWorktreeId
    )
    test.skip(!secondWorktreeId, 'link-hover repro needs the seeded secondary worktree')
    if (!secondWorktreeId) {
      return
    }

    await ensureTerminalVisible(yiruPage)
    await waitForActiveTerminalManager(yiruPage, 30_000)
    const ptyId = await waitForActivePanePtyId(yiruPage)
    await waitForPtyShellEcho(yiruPage, ptyId, 15_000)

    const worktreePath = await activeWorktreePath(yiruPage)
    const fileName = `yiru-linkfile-${randomUUID().slice(0, 8)}.txt`
    const filePath = path.join(worktreePath, fileName)
    writeFileSync(filePath, 'yiru file link target\n')
    const needle = `./${fileName}`

    try {
      await writeStableLinkFixture(yiruPage, ptyId, needle)
      await expect
        .poll(() => getTerminalContent(yiruPage, 4000), {
          timeout: 10_000,
          message: 'file-link fixture did not reach the terminal buffer'
        })
        .toContain(fileName)

      const probe = await assertLinkRecoversAfterReturn(yiruPage, {
        firstWorktreeId,
        secondWorktreeId,
        needle,
        expectContains: fileName
      })
      await activateHoveredLink(yiruPage, probe)
      // The editor header is the user-visible result of a successful terminal
      // link activation; store state alone could pass with a blank editor.
      await expect(yiruPage.locator('.editor-header-path').first()).toContainText(fileName, {
        timeout: 20_000
      })
    } finally {
      await sendToTerminal(yiruPage, ptyId, '\x03')
      await yiruPage.evaluate((filePath) => {
        const state = window.__store?.getState()
        if (state?.openFiles.some((file) => file.filePath === filePath)) {
          state.closeFile(filePath)
        }
      }, filePath)
      rmSync(filePath, { force: true })
    }
  })

  test('re-establishes a URL link on hover after switching worktrees and back', async ({
    yiruPage
  }) => {
    const firstWorktreeId = await waitForActiveWorktree(yiruPage)
    const secondWorktreeId = (await getAllWorktreeIds(yiruPage)).find(
      (id) => id !== firstWorktreeId
    )
    test.skip(!secondWorktreeId, 'link-hover repro needs the seeded secondary worktree')
    if (!secondWorktreeId) {
      return
    }

    await ensureTerminalVisible(yiruPage)
    await waitForActiveTerminalManager(yiruPage, 30_000)
    const ptyId = await waitForActivePanePtyId(yiruPage)
    await waitForPtyShellEcho(yiruPage, ptyId, 15_000)

    const url = `https://example.com/yiru-link-${randomUUID()}`
    try {
      await writeStableLinkFixture(yiruPage, ptyId, url)
      await expect
        .poll(() => getTerminalContent(yiruPage, 4000), {
          timeout: 10_000,
          message: 'URL fixture did not reach the terminal buffer'
        })
        .toContain(url)

      await assertLinkRecoversAfterReturn(yiruPage, {
        firstWorktreeId,
        secondWorktreeId,
        needle: url,
        expectContains: url
      })
    } finally {
      await sendToTerminal(yiruPage, ptyId, '\x03')
    }
  })
})
