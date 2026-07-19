import type { Worktree, WorktreeMeta } from '../../shared/types'

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
