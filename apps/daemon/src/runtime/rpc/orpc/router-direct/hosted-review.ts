import {
  handleHostedReviewCreate,
  handleHostedReviewForBranch,
  handleHostedReviewGetCreationEligibility
} from '~main/runtime/rpc/methods/hosted-review'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: hosted review (opening/checking eligibility for a PR/MR against a
// forge) reads the git-backed repo/worktree state but is its own provider
// integration surface, not source control itself — kept apart from
// source-control.ts.
export const hostedReviewRuntimeHandlers = {
  hostedReview: {
    forBranch: runtimeImplementation.hostedReview.forBranch.handler(
      wireRuntimeMethod('hostedReview.forBranch', handleHostedReviewForBranch)
    ),
    getCreationEligibility: runtimeImplementation.hostedReview.getCreationEligibility.handler(
      wireRuntimeMethod(
        'hostedReview.getCreationEligibility',
        handleHostedReviewGetCreationEligibility
      )
    ),
    create: runtimeImplementation.hostedReview.create.handler(
      wireRuntimeMethod('hostedReview.create', handleHostedReviewCreate)
    )
  }
} as const
