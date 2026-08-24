import type {
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionFileTab,
  RuntimeMobileSessionMarkdownTab,
  RuntimeMobileSessionTerminalClientTab
} from '~shared/runtime-types'
import type {
  BrowserCertificateFailure,
  BrowserPage,
  BrowserWorkspace,
  Tab,
  TerminalLayoutSnapshot,
  TerminalTab
} from '~shared/types'

import type { OpenFile } from '../components/editor/state'
import type { AppState } from '../store'

export type TerminalSurface = RuntimeMobileSessionTerminalClientTab
export type ReadyTerminalSurface = RuntimeMobileSessionTerminalClientTab & { status: 'ready' }
export type ReadyBrowserSurface = RuntimeMobileSessionBrowserTab & { browserPageId: string }
export type ReadyEditorSurface = RuntimeMobileSessionMarkdownTab | RuntimeMobileSessionFileTab

export type MirroredTerminalTab = {
  tab: TerminalTab
  hostTabId: string
  ptyIds: string[]
  layout: TerminalLayoutSnapshot
}

export type MirroredBrowserTab = {
  workspace: BrowserWorkspace
  page: BrowserPage
  certificateFailure: BrowserCertificateFailure | null
  remotePageId: string
  unifiedTab: Tab
  hostTabId: string
}

export type MirroredEditorTab = {
  file: OpenFile
  unifiedTab: Tab
  hostTabId: string
}

export type WebSessionTabsSyncState = Pick<
  AppState,
  | 'activeBrowserTabId'
  | 'activeBrowserTabIdByWorktree'
  | 'activeGroupIdByWorktree'
  | 'activeFileId'
  | 'activeFileIdByWorktree'
  | 'activeTabId'
  | 'activeTabIdByWorktree'
  | 'activeTabType'
  | 'activeTabTypeByWorktree'
  | 'activeWorktreeId'
  | 'agentStatusByPaneKey'
  | 'agentStatusEpoch'
  | 'browserPagesByWorkspace'
  | 'browserCertificateFailuresByPageId'
  | 'browserTabsByWorktree'
  | 'groupsByWorktree'
  | 'layoutByWorktree'
  | 'openFiles'
  | 'ptyIdsByTabId'
  | 'remoteBrowserPageHandlesByPageId'
  | 'tabBarOrderByWorktree'
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'unifiedTabsByWorktree'
  | 'unreadTerminalTabs'
  | 'sortEpoch'
>
