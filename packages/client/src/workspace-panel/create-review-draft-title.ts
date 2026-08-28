import { humanizeBranchSlug } from '@yiru/runtime-protocol/workbench/branch-name-from-work'
import { normalizeHostedReviewHeadRef } from '@yiru/runtime-protocol/workbench/hosted-review-refs'

export function resolveCreateReviewDraftTitle({
  branch,
  eligibilityTitle
}: {
  branch: string
  eligibilityTitle?: string | null
}): string {
  const title = eligibilityTitle?.trim()
  if (title) {
    return title
  }
  const normalizedBranch = normalizeHostedReviewHeadRef(branch)
  const branchLeaf = normalizedBranch.split('/').pop()?.replace(/_/g, '-') ?? ''
  return humanizeBranchSlug(branchLeaf) || normalizedBranch
}
