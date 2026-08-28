import type { TuiAgent } from '../model/agent.js'
import type { WorkspaceStatus } from '../model/workspace.js'

export type RuntimeFolderWorkspaceLinkedReview = {
  provider: 'github' | 'gitlab'
  type: 'pr' | 'mr'
  number: number
  title: string
  url: string
  repoId?: string
}

export type RuntimeFolderWorkspace = {
  id: string
  projectGroupId: string
  name: string
  folderPath: string
  connectionId?: string | null
  linkedReview: RuntimeFolderWorkspaceLinkedReview | null
  comment: string
  isArchived: boolean
  isUnread: boolean
  isPinned: boolean
  sortOrder: number
  manualOrder?: number
  workspaceStatus?: WorkspaceStatus
  createdWithAgent?: TuiAgent
  pendingFirstAgentMessageRename?: boolean
  firstAgentMessageRenameError?: string | null
  lastActivityAt: number
  createdAt: number
  updatedAt: number
}

export type RuntimeFolderWorkspacePathStatus = {
  path: string
  exists: boolean
  reason?: 'missing' | 'not-directory' | 'unavailable'
}

export type RuntimeFolderWorkspaceListResult = {
  folderWorkspaces: RuntimeFolderWorkspace[]
  revision?: number
}
export type RuntimeFolderWorkspaceResult = {
  folderWorkspace: RuntimeFolderWorkspace
  revision?: number
}
export type RuntimeNullableFolderWorkspaceResult = {
  folderWorkspace: RuntimeFolderWorkspace | null
  revision?: number
}
export type RuntimeFolderWorkspaceDeleteResult = { deleted: boolean; revision?: number }
export type RuntimeFolderWorkspacePathStatusResult = {
  status: RuntimeFolderWorkspacePathStatus
}
