import type { FolderWorkspace, Worktree } from './types'
import { folderWorkspaceKey } from './workspace-scope'

export function folderWorkspaceToWorktree(folderWorkspace: FolderWorkspace): Worktree {
  const linkedReview = folderWorkspace.linkedReview
  return {
    id: folderWorkspaceKey(folderWorkspace.id),
    repoId: `folder-workspace:${folderWorkspace.projectGroupId}`,
    displayName: folderWorkspace.name,
    comment: folderWorkspace.comment,
    linkedPR:
      linkedReview?.provider === 'github' && linkedReview.type === 'pr'
        ? linkedReview.number
        : null,
    linkedGitLabMR:
      linkedReview?.provider === 'gitlab' && linkedReview.type === 'mr'
        ? linkedReview.number
        : null,
    linkedBitbucketPR: null,
    linkedAzureDevOpsPR: null,
    linkedGiteaPR: null,
    isArchived: folderWorkspace.isArchived,
    isUnread: folderWorkspace.isUnread,
    isPinned: folderWorkspace.isPinned,
    sortOrder: folderWorkspace.sortOrder,
    manualOrder: folderWorkspace.manualOrder,
    lastActivityAt: folderWorkspace.lastActivityAt,
    createdAt: folderWorkspace.createdAt,
    createdWithAgent: folderWorkspace.createdWithAgent,
    pendingFirstAgentMessageRename: folderWorkspace.pendingFirstAgentMessageRename,
    firstAgentMessageRenameError: folderWorkspace.firstAgentMessageRenameError,
    workspaceStatus: folderWorkspace.workspaceStatus,
    path: folderWorkspace.folderPath,
    head: '',
    branch: '',
    isBare: false,
    isSparse: false,
    isMainWorktree: false
  }
}
