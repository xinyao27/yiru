import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult,
  HostedReviewCreationBlockedReason,
  HostedReviewCreationEligibility,
  HostedReviewProvider
} from '@yiru/workbench-model/review'
import { normalizeHostedReviewBaseRef } from '~shared/hosted-review-refs'

import { getHostedReviewCreationEligibility } from './hosted-review-eligibility'
import type { HostedReviewExecutionOptions } from './hosted-review-git-options'
import {
  getCurrentHostedReviewBranch,
  getHostedReviewUpstreamStatus,
  hasHostedReviewUncommittedChanges,
  stripHostedReviewRefPrefix
} from './hosted-review-provider-state'

export function reviewCopy(provider: HostedReviewProvider): {
  shortLabel: 'PR' | 'MR'
  reviewLabel: 'pull request' | 'merge request'
  providerName: string
  authInstruction: string
} {
  if (provider === 'gitlab') {
    return {
      shortLabel: 'MR',
      reviewLabel: 'merge request',
      providerName: 'GitLab',
      authInstruction: 'Run glab auth login'
    }
  }
  if (provider === 'azure-devops') {
    return {
      shortLabel: 'PR',
      reviewLabel: 'pull request',
      providerName: 'Azure DevOps',
      authInstruction: 'Set YIRU_AZURE_DEVOPS_TOKEN'
    }
  }
  if (provider === 'gitea') {
    return {
      shortLabel: 'PR',
      reviewLabel: 'pull request',
      providerName: 'Gitea',
      authInstruction: 'Set YIRU_GITEA_TOKEN'
    }
  }
  return {
    shortLabel: 'PR',
    reviewLabel: 'pull request',
    providerName: 'GitHub',
    authInstruction: 'Run gh auth login'
  }
}

function blockedCreateResultForReason(
  reason: NonNullable<HostedReviewCreationBlockedReason>,
  provider: HostedReviewProvider,
  submittedBase?: string | null
): CreateHostedReviewResult | null {
  const copy = reviewCopy(provider)
  const baseLabel = submittedBase?.trim() ? `"${submittedBase.trim()}" ` : ''
  const blockedCreateResultByReason = {
    auth_required: {
      ok: false,
      code: 'auth_required',
      error: `Create ${copy.shortLabel} failed: ${copy.providerName} is not authenticated. Next step: ${copy.authInstruction} in this environment.`
    },
    unsupported_provider: {
      ok: false,
      code: 'unsupported_provider',
      error: `Creating ${copy.reviewLabel}s requires a ${copy.providerName} remote.`
    },
    dirty: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: commit or discard local changes before creating a ${copy.reviewLabel}.`
    },
    detached_head: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: switch to a branch before creating a ${copy.reviewLabel}.`
    },
    default_branch: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: choose a feature branch before creating a ${copy.reviewLabel}.`
    },
    no_upstream: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: publish this branch before creating a ${copy.reviewLabel}.`
    },
    needs_push: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: push this branch before creating a ${copy.reviewLabel}.`
    },
    needs_sync: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: sync this branch before creating a ${copy.reviewLabel}.`
    },
    fork_head_unsupported: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: refresh source control status and try again.`
    },
    base_not_on_remote: {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: the base branch ${baseLabel}hasn't been pushed to the remote. Choose a pushed base or push it first.`
    }
  } satisfies Partial<
    Record<NonNullable<HostedReviewCreationBlockedReason>, CreateHostedReviewResult>
  >
  return blockedCreateResultByReason[reason] ?? null
}

function blockedEligibilityToCreateResult(
  eligibility: HostedReviewCreationEligibility,
  submittedBase?: string | null
): CreateHostedReviewResult | null {
  if (eligibility.canCreate) {
    return null
  }
  if (eligibility.review?.url) {
    const copy = reviewCopy(eligibility.provider)
    return {
      ok: false,
      code: 'already_exists',
      error: `A ${copy.reviewLabel} already exists for this branch.`,
      existingReview: eligibility.review
    }
  }
  if (eligibility.blockedReason) {
    return blockedCreateResultForReason(
      eligibility.blockedReason,
      eligibility.provider,
      submittedBase
    )
  }
  const copy = reviewCopy(eligibility.provider)
  return {
    ok: false,
    code: 'validation',
    error: `Create ${copy.shortLabel} failed: refresh source control status and try again.`
  }
}

export async function validateCurrentBranchCanCreateReview(
  repoPath: string,
  connectionId: string | null | undefined,
  input: CreateHostedReviewInput,
  options: HostedReviewExecutionOptions = {}
): Promise<CreateHostedReviewResult | null> {
  const requestedHead = input.head ? stripHostedReviewRefPrefix(input.head).trim() : ''
  const currentBranch = await getCurrentHostedReviewBranch(repoPath, options)
  const copy = reviewCopy(input.provider)
  if (requestedHead && requestedHead !== currentBranch) {
    return {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: switch back to the selected branch before creating a ${copy.reviewLabel}.`
    }
  }

  try {
    const [dirty, upstreamStatus] = await Promise.all([
      hasHostedReviewUncommittedChanges(repoPath, options),
      getHostedReviewUpstreamStatus(repoPath, options)
    ])
    const submittedBase = normalizeHostedReviewBaseRef(input.base)
    const eligibility = await getHostedReviewCreationEligibility({
      repoPath,
      branch: requestedHead || currentBranch,
      base: submittedBase,
      hasUncommittedChanges: dirty,
      hasUpstream: upstreamStatus.hasUpstream,
      ahead: upstreamStatus.ahead,
      behind: upstreamStatus.behind,
      connectionId,
      // Why: provider creation targets the submitted base verbatim.
      enforceBaseOnRemote: true,
      ...options
    })
    // Why: renderer eligibility can be stale by submit time.
    return blockedEligibilityToCreateResult(eligibility, submittedBase)
  } catch (error) {
    console.warn('Hosted review creation preflight failed:', error)
    return {
      ok: false,
      code: 'validation',
      error: `Create ${copy.shortLabel} failed: could not verify branch status. Refresh source control and try again.`
    }
  }
}
