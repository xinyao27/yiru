import { expect, type Page } from '@playwright/test'

type SourceControlSidebarTab = 'source-control' | 'checks'

async function openWorktreeSidebarSurface(
  page: Page,
  worktreeId: string,
  tab: SourceControlSidebarTab
): Promise<void> {
  // Why: persisted UI hydration and deferred terminal preparation can both
  // restore older workspace routes after a transient Zustand state match.
  await expect
    .poll(
      async () => {
        const routeReady = await page.evaluate(
          ({ targetWorktreeId, targetTab }) => {
            const state = window.__store?.getState()
            return Boolean(
              state?.persistedUIReady &&
              state.workspaceSessionReady &&
              state.activeWorktreeId === targetWorktreeId &&
              state.rightSidebarOpen &&
              state.rightSidebarTab === targetTab
            )
          },
          { targetWorktreeId: worktreeId, targetTab: tab }
        )
        const activityButton = page.getByRole('button', {
          name: tab === 'checks' ? /^Checks/ : /^Source Control/
        })
        if (routeReady && (await activityButton.getAttribute('aria-current')) === 'page') {
          return true
        }
        await page.evaluate(
          ({ targetWorktreeId, targetTab }) => {
            const store = window.__store
            if (!store) {
              return
            }
            if (store.getState().activeWorktreeId !== targetWorktreeId) {
              store.getState().setActiveWorktree(targetWorktreeId)
            }
            const state = store.getState()
            if (state.activeWorktreeId === targetWorktreeId) {
              state.setRightSidebarOpen(true)
              state.setRightSidebarTab(targetTab)
            }
          },
          { targetWorktreeId: worktreeId, targetTab: tab }
        )
        return false
      },
      { timeout: 30_000 }
    )
    .toBe(true)
}

export async function openSourceControl(page: Page, worktreeId: string): Promise<void> {
  await openWorktreeSidebarSurface(page, worktreeId, 'source-control')
}

export async function openChecks(page: Page, worktreeId: string): Promise<void> {
  await openWorktreeSidebarSurface(page, worktreeId, 'checks')
}
