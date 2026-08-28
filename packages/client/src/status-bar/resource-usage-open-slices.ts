import type { AppState } from '~renderer/store/state'

const EMPTY_TABS_BY_WORKTREE: AppState['tabsByWorktree'] = {}
const EMPTY_PTY_IDS_BY_TAB_ID: AppState['ptyIdsByTabId'] = {}
const EMPTY_TERMINAL_LAYOUTS_BY_TAB_ID: AppState['terminalLayoutsByTabId'] = {}
const EMPTY_RUNTIME_PANE_TITLES_BY_TAB_ID: AppState['runtimePaneTitlesByTabId'] = {}
const EMPTY_BROWSER_TABS_BY_WORKTREE: AppState['browserTabsByWorktree'] = {}

export function getResourceUsageTabsByWorktree(
  state: Pick<AppState, 'tabsByWorktree'>,
  open: boolean
): AppState['tabsByWorktree'] {
  return open ? state.tabsByWorktree : EMPTY_TABS_BY_WORKTREE
}

export function getResourceUsagePtyIdsByTabId(
  state: Pick<AppState, 'ptyIdsByTabId'>,
  open: boolean
): AppState['ptyIdsByTabId'] {
  return open ? state.ptyIdsByTabId : EMPTY_PTY_IDS_BY_TAB_ID
}

export function getResourceUsageTerminalLayoutsByTabId(
  state: Pick<AppState, 'terminalLayoutsByTabId'>,
  open: boolean
): AppState['terminalLayoutsByTabId'] {
  return open ? state.terminalLayoutsByTabId : EMPTY_TERMINAL_LAYOUTS_BY_TAB_ID
}

export function getResourceUsageRuntimePaneTitlesByTabId(
  state: Pick<AppState, 'runtimePaneTitlesByTabId'>,
  open: boolean
): AppState['runtimePaneTitlesByTabId'] {
  return open ? state.runtimePaneTitlesByTabId : EMPTY_RUNTIME_PANE_TITLES_BY_TAB_ID
}

export function getResourceUsageBrowserTabsByWorktree(
  state: Pick<AppState, 'browserTabsByWorktree'>,
  open: boolean
): AppState['browserTabsByWorktree'] {
  return open ? state.browserTabsByWorktree : EMPTY_BROWSER_TABS_BY_WORKTREE
}
