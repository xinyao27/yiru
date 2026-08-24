import type { AppState } from '~renderer/store/types'

const EMPTY_BROWSER_TABS_BY_WORKTREE: AppState['browserTabsByWorktree'] = {}
const EMPTY_BROWSER_PAGES_BY_WORKSPACE: AppState['browserPagesByWorkspace'] = {}

export function getBrowserTabsByWorktree(state: AppState): AppState['browserTabsByWorktree'] {
  // Why: runtime sync can observe a partial pre-browser renderer state during hydration.
  return state.browserTabsByWorktree ?? EMPTY_BROWSER_TABS_BY_WORKTREE
}

export function getBrowserPagesByWorkspace(state: AppState): AppState['browserPagesByWorkspace'] {
  return state.browserPagesByWorkspace ?? EMPTY_BROWSER_PAGES_BY_WORKSPACE
}
