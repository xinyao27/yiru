import { isPositiveHostedReviewNumber, type HostedReviewInfo } from '@yiru/workbench-model/review'

import {
  getForgeProviderById,
  getForgeProviderForRepository,
  type ForgeProviderId
} from './forge-provider'
import type { HostedReviewExecutionOptions } from './hosted-review-git-options'

function reviewLinkForProvider(
  input: Parameters<typeof getHostedReviewForBranch>[0],
  provider: ForgeProviderId
): { linkedReviewNumber?: number | null; fallbackReviewNumber?: number | null } {
  switch (provider) {
    case 'github':
      return {
        linkedReviewNumber: input.linkedGitHubPR ?? null,
        fallbackReviewNumber: input.linkedGitHubPR == null ? (input.fallbackGitHubPR ?? null) : null
      }
    case 'gitlab':
      return { linkedReviewNumber: input.linkedGitLabMR ?? null }
    case 'bitbucket':
      return { linkedReviewNumber: input.linkedBitbucketPR ?? null }
    case 'azure-devops':
      return { linkedReviewNumber: input.linkedAzureDevOpsPR ?? null }
    case 'gitea':
      return { linkedReviewNumber: input.linkedGiteaPR ?? null }
  }
}

function strictLinkedReviewProvider(
  input: Parameters<typeof getHostedReviewForBranch>[0]
): ForgeProviderId | null {
  const links: readonly [ForgeProviderId, number | null | undefined][] = [
    ['github', input.linkedGitHubPR],
    ['gitlab', input.linkedGitLabMR],
    ['bitbucket', input.linkedBitbucketPR],
    ['azure-devops', input.linkedAzureDevOpsPR],
    ['gitea', input.linkedGiteaPR]
  ]
  const linkedProviders = links
    .filter(([, number]) => isPositiveHostedReviewNumber(number))
    .map(([provider]) => provider)
  return linkedProviders.length === 1 ? (linkedProviders[0] ?? null) : null
}

export async function getHostedReviewForBranch(
  input: {
    repoPath: string
    connectionId?: string | null
    branch: string
    linkedGitHubPR?: number | null
    fallbackGitHubPR?: number | null
    linkedGitLabMR?: number | null
    linkedBitbucketPR?: number | null
    linkedAzureDevOpsPR?: number | null
    linkedGiteaPR?: number | null
    currentHeadOid?: string | null
    throwOnProviderError?: boolean
  } & HostedReviewExecutionOptions
): Promise<HostedReviewInfo | null> {
  const branchName = input.branch.replace(/^refs\/heads\//, '')
  // Why: detached HEAD cannot use branch lookup, but provider-specific exact
  // ids can still resolve the review without probing an empty branch name.
  if (
    !branchName &&
    input.linkedGitHubPR == null &&
    input.fallbackGitHubPR == null &&
    input.linkedGitLabMR == null &&
    input.linkedBitbucketPR == null &&
    input.linkedAzureDevOpsPR == null &&
    input.linkedGiteaPR == null
  ) {
    return null
  }

  // Why: a durable provider-specific link remains authoritative when strict remote detection fails.
  const linkedProvider = input.throwOnProviderError ? strictLinkedReviewProvider(input) : null
  const provider =
    linkedProvider !== null
      ? getForgeProviderById(linkedProvider)
      : await getForgeProviderForRepository({
          repoPath: input.repoPath,
          connectionId: input.connectionId,
          ...(input.localGitExecOptions ? { localGitExecOptions: input.localGitExecOptions } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.throwOnProviderError ? { throwOnProviderError: true } : {})
        })
  if (!provider) {
    return null
  }
  return provider.getReviewForBranch({
    repoPath: input.repoPath,
    connectionId: input.connectionId,
    branch: branchName,
    ...(input.localGitExecOptions ? { localGitExecOptions: input.localGitExecOptions } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.throwOnProviderError ? { throwOnProviderError: true } : {}),
    githubCurrentHeadOid: input.currentHeadOid ?? null,
    ...reviewLinkForProvider(input, provider.id)
  })
}
