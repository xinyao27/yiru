import type { AgentStatusEntry, TuiAgent } from '@yiru/workbench-model/agent'

import type { RuntimeMobileTerminalTheme } from '../mobile-runtime-types.js'
import type { BrowserCertificateFailure, BrowserLoadError } from './browser/session-result.js'

export type RuntimeTerminalPaneLayoutNode =
  | { type: 'leaf'; leafId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: RuntimeTerminalPaneLayoutNode
      second: RuntimeTerminalPaneLayoutNode
      ratio?: number
    }

export type RuntimeTerminalLayoutSnapshot = {
  root: RuntimeTerminalPaneLayoutNode | null
  activeLeafId: string | null
  expandedLeafId: string | null
  ptyIdsByLeafId?: Record<string, string>
  buffersByLeafId?: Record<string, string>
  scrollbackRefsByLeafId?: Record<string, string>
  titlesByLeafId?: Record<string, string>
}

export type RuntimeTabGroupLayoutNode =
  | { type: 'leaf'; groupId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: RuntimeTabGroupLayoutNode
      second: RuntimeTabGroupLayoutNode
      ratio?: number
    }

export type RuntimeMobileSessionTerminalTab = {
  type: 'terminal'
  id: string
  title: string
  quickCommandLabel?: string | null
  parentTabId: string
  leafId: string
  ptyId?: string | null
  terminalTheme?: RuntimeMobileTerminalTheme
  agentStatus?: AgentStatusEntry | null
  launchAgent?: TuiAgent
  startupCwd?: string
  parentLayout?: RuntimeTerminalLayoutSnapshot
  color?: string | null
  isPinned?: boolean
  viewMode?: 'terminal' | 'chat'
  isActive: boolean
}

export type RuntimeMobileSessionMarkdownTab = {
  type: 'markdown'
  id: string
  title: string
  filePath: string
  relativePath: string
  language: 'markdown'
  mode: 'edit' | 'markdown-preview'
  isDirty: boolean
  isActive: boolean
  sourceFileId: string
  sourceFilePath: string
  sourceRelativePath: string
  documentVersion: string
  color?: string | null
  isPinned?: boolean
}

export type RuntimeMobileSessionFileTab = {
  type: 'file'
  id: string
  title: string
  filePath: string
  relativePath: string
  language: string
  mode?: 'edit' | 'diff'
  diffSource?: 'staged' | 'unstaged'
  isDirty: boolean
  color?: string | null
  isPinned?: boolean
  isActive: boolean
}

export type RuntimeMobileSessionBrowserTab = {
  type: 'browser'
  id: string
  title: string
  browserWorkspaceId: string
  browserPageId: string | null
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  loadError?: BrowserLoadError | null
  certificateFailure?: BrowserCertificateFailure | null
  color?: string | null
  isPinned?: boolean
  isActive: boolean
}

export type RuntimeMobileSessionTerminalClientTab =
  | (RuntimeMobileSessionTerminalTab & {
      status: 'pending-handle'
      terminal: null
    })
  | (RuntimeMobileSessionTerminalTab & {
      status: 'ready'
      terminal: string
      worktreeInstanceId?: string | null
    })

export type RuntimeMobileSessionClientTab =
  | RuntimeMobileSessionTerminalClientTab
  | RuntimeMobileSessionMarkdownTab
  | RuntimeMobileSessionFileTab
  | RuntimeMobileSessionBrowserTab

export type RuntimeMobileSessionTabGroup = {
  id: string
  activeTabId: string | null
  tabOrder: string[]
  recentTabIds?: string[]
}

export type RuntimeMobileSessionTabsResult = {
  worktree: string
  publicationEpoch: string
  snapshotVersion: number
  activeGroupId: string | null
  activeTabId: string | null
  activeTabType: 'terminal' | 'markdown' | 'file' | 'browser' | null
  tabGroups?: RuntimeMobileSessionTabGroup[]
  tabGroupLayout?: RuntimeTabGroupLayoutNode | null
  tabs: RuntimeMobileSessionClientTab[]
}

export type RuntimeMobileSessionCreateTerminalResult = {
  tab: RuntimeMobileSessionTerminalClientTab
  publicationEpoch: string
  snapshotVersion: number
}

export type RuntimeMobileSessionTabsListAllResult = {
  snapshots: RuntimeMobileSessionTabsResult[]
}

export type RuntimeMobileSessionTabCloseResult = { closed: true }
export type RuntimeMobileSessionTabMoveResult = { moved: true }
export type RuntimeMobileSessionTabUpdateResult = { updated: true }
export type RuntimeMobileSessionTabsUnsubscribeResult = { unsubscribed: true }

export type RuntimeMobileSessionTabsStreamEvent =
  | ({ type: 'snapshot' } & RuntimeMobileSessionTabsResult)
  | ({ type: 'updated' } & RuntimeMobileSessionTabsResult)
  | { type: 'end' }

export type RuntimeMobileSessionTabsAllStreamEvent =
  | { type: 'snapshots'; snapshots: RuntimeMobileSessionTabsResult[] }
  | ({ type: 'updated' } & RuntimeMobileSessionTabsResult)
  | { type: 'end' }

export type RuntimeMarkdownReadOnlyReason =
  | 'unsupported_preview'
  | 'unsupported_tab'
  | 'unsupported_untitled'
  | 'file_too_large'

export type RuntimeMarkdownReadTabResult = {
  tabId: string
  filePath: string
  relativePath: string
  content: string
  isDirty: boolean
  version: string
  source: 'draft' | 'file'
  editable: boolean
  readOnlyReason?: RuntimeMarkdownReadOnlyReason
}

export type RuntimeMarkdownSaveTabResult = {
  tabId: string
  version: string
  isDirty: false
  content: string
}
