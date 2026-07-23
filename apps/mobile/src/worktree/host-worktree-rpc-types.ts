import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { RepoIcon } from '@yiru/workbench-model/workspace'

// Locally-typed subset of the desktop status payload read from status.get.
export type DesktopStatus = {
  protocolVersion?: number
  minCompatibleMobileVersion?: number
}

export type RepoSummary = {
  id: string
  displayName: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  badgeColor?: string
  repoIcon?: RepoIcon | null
}
