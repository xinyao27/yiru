import type { RuntimeRepo } from './repo-types.js'

export type RuntimeProjectGroup = {
  id: string
  name: string
  parentPath: string | null
  connectionId?: string | null
  executionHostId?: string | null
  parentGroupId: string | null
  createdFrom: 'manual' | 'folder-scan' | 'migration'
  tabOrder: number
  isCollapsed: boolean
  color: string | null
  createdAt: number
  updatedAt: number
}

export type RuntimeNestedRepoCandidate = {
  path: string
  displayName: string
  depth: number
}

export type RuntimeNestedRepoScanResult = {
  selectedPath: string
  selectedPathKind: 'git_repo' | 'non_git_folder'
  repos: RuntimeNestedRepoCandidate[]
  truncated: boolean
  timedOut: boolean
  stopped: boolean
  durationMs: number
  maxDepth: number
  maxRepos: number
  timeoutMs: number | null
}

export type RuntimeProjectGroupImportProjectResult = {
  path: string
  projectId?: string
  status: 'imported' | 'already-known' | 'failed'
  error?: string
}

export type RuntimeProjectGroupImportResult = {
  group?: RuntimeProjectGroup
  projects: RuntimeProjectGroupImportProjectResult[]
  importedCount: number
  alreadyKnownCount: number
  failedCount: number
}

export type RuntimeProjectGroupListResult = { groups: RuntimeProjectGroup[] }
export type RuntimeProjectGroupResult = { group: RuntimeProjectGroup }
export type RuntimeNullableProjectGroupResult = { group: RuntimeProjectGroup | null }
export type RuntimeProjectGroupDeleteResult = { deleted: boolean }
export type RuntimeProjectGroupMoveProjectResult = { repo: RuntimeRepo }
export type RuntimeProjectGroupCancelNestedScanResult = { cancelled: boolean }

// Why: nested-repo scanning is long-running and per-request (scoped to a
// scanId), unlike the host-wide feeds in client-events.ts — the shell learns
// this from the same in-process scan today; paired clients need the same
// ticks to render progress and to know when a scan they started finishes.
export type RuntimeNestedRepoScanProgressEvent = {
  type: 'nestedRepoScanProgress'
  scanId: string
  scan: RuntimeNestedRepoScanResult
}

export type RuntimeNestedRepoScanProgressSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeNestedRepoScanProgressEvent
  | { type: 'end' }
