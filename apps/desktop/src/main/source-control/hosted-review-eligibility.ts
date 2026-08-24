import {
  supportsHostedReviewCreation,
  type HostedReviewCreationEligibility,
  type HostedReviewCreationEligibilityArgs
} from '@yiru/workbench-model/review'
import { normalizeHostedReviewBaseRef } from '~shared/hosted-review-refs'

import { detectHostedReviewProvider } from './forge-provider'
import { getHostedReviewForBranch } from './hosted-review'
import type { HostedReviewExecutionOptions } from './hosted-review-git-options'
import {
  getDefaultHostedReviewBaseRef,
  hostedReviewBaseExistsOnRemote,
  hostedReviewExecutionContext,
  isHostedReviewProviderAuthenticated,
  stripHostedReviewRefPrefix
} from './hosted-review-provider-state'

export type HostedReviewCreationEligibilityInput = HostedReviewCreationEligibilityArgs & {
  connectionId?: string | null
  // Why: only the create-time preflight makes a missing remote base a hard block;
  // renderer probes use the base as a correctable candidate.
  enforceBaseOnRemote?: boolean
} & HostedReviewExecutionOptions

export async function getHostedReviewCreationEligibility(
  args: HostedReviewCreationEligibilityInput
): Promise<HostedReviewCreationEligibility> {
  const branch = stripHostedReviewRefPrefix(args.branch).trim()
  const provider = await detectHostedReviewProvider({
    repoPath: args.repoPath,
    connectionId: args.connectionId,
    ...hostedReviewExecutionContext(args)
  })
  const candidateBase = args.base?.trim() || null
  const candidateBaseOnRemote =
    candidateBase != null &&
    (await hostedReviewBaseExistsOnRemote(candidateBase, args.repoPath, args))
  const defaultBaseRef =
    candidateBase && candidateBaseOnRemote
      ? candidateBase
      : ((await getDefaultHostedReviewBaseRef(args.repoPath, args)) ?? candidateBase)
  const baseBranch = defaultBaseRef ? normalizeHostedReviewBaseRef(defaultBaseRef) : null

  let review: Awaited<ReturnType<typeof getHostedReviewForBranch>> = null
  try {
    review = await getHostedReviewForBranch({
      repoPath: args.repoPath,
      branch,
      linkedGitHubPR: args.linkedGitHubPR ?? null,
      fallbackGitHubPR: args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null,
      linkedGitLabMR: args.linkedGitLabMR ?? null,
      linkedBitbucketPR: args.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: args.linkedGiteaPR ?? null,
      connectionId: args.connectionId ?? null,
      ...hostedReviewExecutionContext(args)
    })
  } catch (error) {
    const canReturnLocalBlocker =
      branch &&
      branch !== 'HEAD' &&
      supportsHostedReviewCreation(provider) &&
      (!baseBranch || branch.toLowerCase() !== baseBranch.toLowerCase()) &&
      (args.hasUncommittedChanges || args.hasUpstream !== true || (args.behind ?? 0) > 0)
    if (!canReturnLocalBlocker) {
      throw error
    }
    // Why: local blockers should survive a flaky existing-review lookup so the
    // UI can still offer the preparation action.
    console.warn('Hosted review lookup failed while resolving local review blocker:', error)
  }

  const baseResult = {
    provider,
    review: review ? { number: review.number, url: review.url } : null,
    defaultBaseRef,
    head: branch || null
  }
  if (!branch || branch === 'HEAD') {
    return { ...baseResult, canCreate: false, blockedReason: 'detached_head', nextAction: null }
  }
  if (review) {
    return {
      ...baseResult,
      canCreate: false,
      blockedReason: 'existing_review',
      nextAction: 'open_existing_review'
    }
  }
  if (!supportsHostedReviewCreation(provider)) {
    return {
      ...baseResult,
      canCreate: false,
      blockedReason: 'unsupported_provider',
      nextAction: null
    }
  }
  if (baseBranch && branch.toLowerCase() === baseBranch.toLowerCase()) {
    return { ...baseResult, canCreate: false, blockedReason: 'default_branch', nextAction: null }
  }
  if (args.hasUncommittedChanges) {
    return { ...baseResult, canCreate: false, blockedReason: 'dirty', nextAction: 'commit' }
  }
  if (args.hasUpstream === false) {
    return { ...baseResult, canCreate: false, blockedReason: 'no_upstream', nextAction: 'publish' }
  }
  if (args.hasUpstream !== true) {
    return { ...baseResult, canCreate: false, blockedReason: null, nextAction: null }
  }
  if ((args.behind ?? 0) > 0) {
    return { ...baseResult, canCreate: false, blockedReason: 'needs_sync', nextAction: 'sync' }
  }
  if (
    !(await isHostedReviewProviderAuthenticated(provider, args.repoPath, args.connectionId, args))
  ) {
    return {
      ...baseResult,
      canCreate: false,
      blockedReason: 'auth_required',
      nextAction: 'authenticate'
    }
  }
  if ((args.ahead ?? 0) > 0) {
    return { ...baseResult, canCreate: false, blockedReason: 'needs_push', nextAction: 'push' }
  }
  if (args.enforceBaseOnRemote && candidateBase && !candidateBaseOnRemote) {
    return {
      ...baseResult,
      canCreate: false,
      blockedReason: 'base_not_on_remote',
      nextAction: null
    }
  }
  return { ...baseResult, canCreate: Boolean(baseBranch), blockedReason: null, nextAction: null }
}
