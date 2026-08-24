import { randomUUID } from 'node:crypto'

import type { WorktreeMeta } from '~shared/types'
import { DEFAULT_WORKSPACE_STATUS_ID } from '~shared/workspace/statuses'

export function getDefaultWorktreeMeta(): WorktreeMeta {
  return {
    instanceId: randomUUID(),
    displayName: '',
    comment: '',
    linkedPR: null,
    linkedGitLabMR: null,
    linkedBitbucketPR: null,
    linkedAzureDevOpsPR: null,
    linkedGiteaPR: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: Date.now(),
    lastActivityAt: 0,
    workspaceStatus: DEFAULT_WORKSPACE_STATUS_ID
  }
}
