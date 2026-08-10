import type { TuiAgent } from '@yiru/workbench-model/agent'

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
  workspaceStatus?: string
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
}
export type RuntimeFolderWorkspaceResult = {
  folderWorkspace: RuntimeFolderWorkspace
}
export type RuntimeNullableFolderWorkspaceResult = {
  folderWorkspace: RuntimeFolderWorkspace | null
}
export type RuntimeFolderWorkspaceDeleteResult = { deleted: boolean }
export type RuntimeFolderWorkspacePathStatusResult = {
  status: RuntimeFolderWorkspacePathStatus
}
