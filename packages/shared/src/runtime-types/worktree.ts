import type * as RuntimeMobileTypes from '@yiru/runtime-protocol/mobile-runtime-types'

import type {
  BaseRefSearchResult,
  CreateWorktreeResult,
  GitWorktreeInfo,
  RemoveWorktreeResult,
  Repo,
  Worktree,
  WorktreeLineage,
  WorkspaceLineage,
  WorktreeLineageWarning
} from '../types'

/** One agent's live status as carried to mobile in a worktree.ps summary.
 *  Flat shape (parentPaneKey points to another row in the same worktree's list)
 *  so the client can rebuild the spawn-lineage tree desktop renders inline. */
export type RuntimeWorktreeAgentRow = RuntimeMobileTypes.RuntimeWorktreeAgentRow

export type RuntimeWorktreePsSummary = {
  workspaceKind?: 'git' | 'folder-workspace'
  worktreeId: string
  repoId: string
  hostId?: Worktree['hostId']
  resumeTargetStatus?: 'local' | 'runtime' | 'unknown'
  terminalPlatform?: NodeJS.Platform
  priorWorktreeIds?: string[]
  repo: string
  path: string
  branch: string
  isArchived: boolean
  isMainWorktree: boolean
  hasHostSidebarActivity: boolean
  worktreeInstanceId?: string
  lineageWorktreeInstanceId?: string
  parentWorktreeInstanceId?: string
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  displayName: string
  workspaceStatus: string
  sortOrder: number
  manualOrder?: number
  lastActivityAt?: number
  createdAt?: number
  linkedPR: { number: number; state: string } | null
  linkedGitLabMR: number | null
  comment: string
  isPinned: boolean
  /** True for the worktree currently focused on the desktop/host
   *  (session.activeWorktreeId). Mobile scrolls it into view and highlights it
   *  so the list reflects the desktop's current selection. */
  isActive: boolean
  unread: boolean
  liveTerminalCount: number
  hasAttachedPty: boolean
  lastOutputAt: number | null
  preview: string
  status: RuntimeWorktreeStatus
  /** Live agents in this worktree, newest-state-first. Empty for shell-only
   *  worktrees. Mirrors desktop's inline agent list (WorktreeCardAgents). */
  agents: RuntimeWorktreeAgentRow[]
}

export type RuntimeGitLocalBranches = RuntimeMobileTypes.RuntimeGitLocalBranches

export type RuntimeGitCheckoutResult = {
  ok: true
  branch: string
}

export type RuntimeWorktreeStatus = 'active' | 'working' | 'permission' | 'done' | 'inactive'

export type RuntimeWorktreeRecord = Worktree & {
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  lineage: WorktreeLineage | null
  workspaceLineage?: WorkspaceLineage | null
  git: GitWorktreeInfo
}

export type RuntimeWorktreeCreateResult = {
  worktree: RuntimeWorktreeRecord
  lineage: WorktreeLineage | null
  workspaceLineage?: WorkspaceLineage | null
  warnings: WorktreeLineageWarning[]
  warning?: string
  startupTerminal?: CreateWorktreeResult['startupTerminal']
  agentTerminalHandle?: string
}

export type RuntimeWorktreeRemoveResult = RemoveWorktreeResult & {
  removed: boolean
  warning?: string
}

export type RuntimeWorktreePsResult = {
  worktrees: RuntimeWorktreePsSummary[]
  totalCount: number
  truncated: boolean
}

export type RuntimeRepoList = {
  repos: Repo[]
}

export type RuntimeRepoSearchRefs = {
  refs: string[]
  refDetails?: BaseRefSearchResult[]
  truncated: boolean
}

export type RuntimeWorktreeListResult = {
  worktrees: RuntimeWorktreeRecord[]
  totalCount: number
  truncated: boolean
}

export type RuntimeWorkspaceOpenPathResult = {
  requestedPath: string
  resolvedPath: string
  repoId: string
  worktreeId: string
  kind: 'git' | 'folder'
  disposition: 'activated' | 'added'
}
