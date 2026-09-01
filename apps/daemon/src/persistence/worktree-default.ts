import { randomUUID } from 'node:crypto'

import type { WorktreeMeta } from '@yiru/runtime-protocol/workbench/types'
import { DEFAULT_WORKSPACE_STATUS_ID } from '@yiru/runtime-protocol/workbench/workspace/statuses'

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
