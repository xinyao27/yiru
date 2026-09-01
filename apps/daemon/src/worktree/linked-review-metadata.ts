import type { Worktree, WorktreeMeta } from '@yiru/runtime-protocol/workbench/types'

type LinkedReviewMetadata = Pick<
  Worktree,
  'linkedGitLabMR' | 'linkedBitbucketPR' | 'linkedAzureDevOpsPR' | 'linkedGiteaPR'
>

export function getLinkedReviewMetadata(meta: WorktreeMeta | undefined): LinkedReviewMetadata {
  return {
    linkedGitLabMR: meta?.linkedGitLabMR ?? null,
    linkedBitbucketPR: meta?.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: meta?.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: meta?.linkedGiteaPR ?? null
  }
}
