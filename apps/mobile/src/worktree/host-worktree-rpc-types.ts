import type { ExecutionHostId } from '../../../desktop/src/shared/execution-host'
import type { RepoIcon } from '../../../desktop/src/shared/repo-icon'

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
