import {
  handleGitHubListAssignableUsers,
  handleGitHubListLabels,
  handleGitHubListWorkItems,
  handleGitHubPrCheckDetails,
  handleGitHubPrChecks,
  handleGitHubPrComments,
  handleGitHubPrFileContents,
  handleGitHubPrForBranch,
  handleGitHubRefreshPRForBranch,
  handleGitHubRateLimit,
  handleGitHubRepoSlug,
  handleGitHubRepoUpstream,
  handleGitHubWorkItem,
  handleGitHubWorkItemByOwnerRepo,
  handleGitHubWorkItemDetails
} from '~main/runtime/rpc/methods/github'
import { handleGitHubEventsSubscribe } from '~main/runtime/rpc/methods/github-events'
import {
  handleGitHubAddPRComment,
  handleGitHubAddPRReviewComment,
  handleGitHubAddPRReviewCommentReply,
  handleGitHubMergePR,
  handleGitHubRemovePRReviewers,
  handleGitHubRequestPRReviewers,
  handleGitHubRerunPRChecks,
  handleGitHubResolveReviewThread,
  handleGitHubSetPRAutoMerge,
  handleGitHubSetPRFileViewed,
  handleGitHubUpdatePR,
  handleGitHubUpdatePRState,
  handleGitHubUpdatePRTitle
} from '~main/runtime/rpc/methods/github-pull-request-writes'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: GitHub's hosted-review surface — kept apart from gitlab.ts even though
// the two providers mirror each other, because each domain alone is already
// large enough to earn its own file.
export const githubRuntimeHandlers = {
  github: {
    repoSlug: runtimeImplementation.github.repoSlug.handler(
      wireRuntimeMethod('github.repoSlug', handleGitHubRepoSlug)
    ),
    repoUpstream: runtimeImplementation.github.repoUpstream.handler(
      wireRuntimeMethod('github.repoUpstream', handleGitHubRepoUpstream)
    ),
    rateLimit: runtimeImplementation.github.rateLimit.handler(
      wireRuntimeMethod('github.rateLimit', handleGitHubRateLimit)
    ),
    listWorkItems: runtimeImplementation.github.listWorkItems.handler(
      wireRuntimeMethod('github.listWorkItems', handleGitHubListWorkItems)
    ),
    listLabels: runtimeImplementation.github.listLabels.handler(
      wireRuntimeMethod('github.listLabels', handleGitHubListLabels)
    ),
    listAssignableUsers: runtimeImplementation.github.listAssignableUsers.handler(
      wireRuntimeMethod('github.listAssignableUsers', handleGitHubListAssignableUsers)
    ),
    workItem: runtimeImplementation.github.workItem.handler(
      wireRuntimeMethod('github.workItem', handleGitHubWorkItem)
    ),
    workItemByOwnerRepo: runtimeImplementation.github.workItemByOwnerRepo.handler(
      wireRuntimeMethod('github.workItemByOwnerRepo', handleGitHubWorkItemByOwnerRepo)
    ),
    workItemDetails: runtimeImplementation.github.workItemDetails.handler(
      wireRuntimeMethod('github.workItemDetails', handleGitHubWorkItemDetails)
    ),
    prForBranch: runtimeImplementation.github.prForBranch.handler(
      wireRuntimeMethod('github.prForBranch', handleGitHubPrForBranch)
    ),
    refreshPRForBranch: runtimeImplementation.github.refreshPRForBranch.handler(
      wireRuntimeMethod('github.refreshPRForBranch', handleGitHubRefreshPRForBranch)
    ),
    prChecks: runtimeImplementation.github.prChecks.handler(
      wireRuntimeMethod('github.prChecks', handleGitHubPrChecks)
    ),
    prCheckDetails: runtimeImplementation.github.prCheckDetails.handler(
      wireRuntimeMethod('github.prCheckDetails', handleGitHubPrCheckDetails)
    ),
    prComments: runtimeImplementation.github.prComments.handler(
      wireRuntimeMethod('github.prComments', handleGitHubPrComments)
    ),
    prFileContents: runtimeImplementation.github.prFileContents.handler(
      wireRuntimeMethod('github.prFileContents', handleGitHubPrFileContents)
    ),
    rerunPRChecks: runtimeImplementation.github.rerunPRChecks.handler(
      wireRuntimeMethod('github.rerunPRChecks', handleGitHubRerunPRChecks)
    ),
    resolveReviewThread: runtimeImplementation.github.resolveReviewThread.handler(
      wireRuntimeMethod('github.resolveReviewThread', handleGitHubResolveReviewThread)
    ),
    setPRFileViewed: runtimeImplementation.github.setPRFileViewed.handler(
      wireRuntimeMethod('github.setPRFileViewed', handleGitHubSetPRFileViewed)
    ),
    updatePRTitle: runtimeImplementation.github.updatePRTitle.handler(
      wireRuntimeMethod('github.updatePRTitle', handleGitHubUpdatePRTitle)
    ),
    updatePR: runtimeImplementation.github.updatePR.handler(
      wireRuntimeMethod('github.updatePR', handleGitHubUpdatePR)
    ),
    mergePR: runtimeImplementation.github.mergePR.handler(
      wireRuntimeMethod('github.mergePR', handleGitHubMergePR)
    ),
    setPRAutoMerge: runtimeImplementation.github.setPRAutoMerge.handler(
      wireRuntimeMethod('github.setPRAutoMerge', handleGitHubSetPRAutoMerge)
    ),
    updatePRState: runtimeImplementation.github.updatePRState.handler(
      wireRuntimeMethod('github.updatePRState', handleGitHubUpdatePRState)
    ),
    requestPRReviewers: runtimeImplementation.github.requestPRReviewers.handler(
      wireRuntimeMethod('github.requestPRReviewers', handleGitHubRequestPRReviewers)
    ),
    removePRReviewers: runtimeImplementation.github.removePRReviewers.handler(
      wireRuntimeMethod('github.removePRReviewers', handleGitHubRemovePRReviewers)
    ),
    addPRComment: runtimeImplementation.github.addPRComment.handler(
      wireRuntimeMethod('github.addPRComment', handleGitHubAddPRComment)
    ),
    addPRReviewComment: runtimeImplementation.github.addPRReviewComment.handler(
      wireRuntimeMethod('github.addPRReviewComment', handleGitHubAddPRReviewComment)
    ),
    addPRReviewCommentReply: runtimeImplementation.github.addPRReviewCommentReply.handler(
      wireRuntimeMethod('github.addPRReviewCommentReply', handleGitHubAddPRReviewCommentReply)
    ),
    events: {
      subscribe: runtimeImplementation.github.events.subscribe.handler(
        wireRuntimeStream('github.events.subscribe', handleGitHubEventsSubscribe)
      )
    }
  }
} as const
