import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult
} from '@yiru/runtime-protocol/model/review'
import { supportsHostedReviewCreation } from '@yiru/runtime-protocol/model/review'

import { getForgeProviderForRepository } from './forge-provider'
export {
  getHostedReviewCreationEligibility,
  type HostedReviewCreationEligibilityInput
} from './hosted-review-eligibility'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from './hosted-review-git-options'
import { reviewCopy, validateCurrentBranchCanCreateReview } from './hosted-review-preflight'
import { hostedReviewExecutionContext } from './hosted-review-provider-state'

export async function createHostedReview(
  repoPath: string,
  input: CreateHostedReviewInput,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<CreateHostedReviewResult> {
  if (!supportsHostedReviewCreation(input.provider)) {
    return {
      ok: false,
      code: 'unsupported_provider',
      error: 'Creating reviews for this provider is not supported yet.'
    }
  }
  const provider = await getForgeProviderForRepository({
    repoPath,
    connectionId,
    ...hostedReviewExecutionContext(options)
  })
  if (provider?.id !== input.provider || !provider.createReview) {
    const copy = reviewCopy(input.provider)
    return {
      ok: false,
      code: 'unsupported_provider',
      error: `Creating ${copy.reviewLabel}s requires a ${copy.providerName} remote.`
    }
  }
  const blocked = await validateCurrentBranchCanCreateReview(repoPath, connectionId, input, options)
  if (blocked) {
    return blocked
  }
  const localGitOptions = getHostedReviewLocalGitOptions(options)
  return Object.keys(localGitOptions).length > 0
    ? provider.createReview(repoPath, input, connectionId, options)
    : provider.createReview(repoPath, input, connectionId)
}
