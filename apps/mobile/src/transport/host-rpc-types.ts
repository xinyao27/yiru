import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { RepoIcon } from '@yiru/workbench-model/workspace'

// Locally-typed subset of the desktop status payload read from status.get.
export type DesktopStatus = {
  runtimeProtocolVersion?: number
  minCompatibleRuntimeClientVersion?: number
  protocolVersion?: number
  minCompatibleMobileVersion?: number
  // Why: absent on hosts that predate Mobile Floating Workspace support; fail closed.
  floatingWorkspaceEnabled?: boolean
}

export type RepoSummary = {
  id: string
  displayName: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  badgeColor?: string
  repoIcon?: RepoIcon | null
}
