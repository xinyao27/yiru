import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type {
  SpoolChecksReadOperation,
  SpoolChecksReadResult
} from '../../shared/spool/spool-operation-contract'
import {
  normalizeSpoolChecksHttpUrl,
  SpoolChecksReadResultSchema
} from '../../shared/spool/spool-checks-result-schema'
import { SpoolChecksReadCache } from './spool-checks-read-cache'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

type SpoolChecksRuntime = Pick<
  OrcaRuntimeService,
  'getHostedReviewForBranch' | 'getRepoPRChecks' | 'getRuntimeGitStatus'
>

const MAX_CHECKS = 256

/** Projects owner-hosted review state without exposing repository paths or credentials. */
export class OrcaSpoolHostChecks {
  private readonly cache = new SpoolChecksReadCache()

  constructor(
    private readonly store: Store,
    private readonly runtime: SpoolChecksRuntime
  ) {}

  async invoke(
    target: SpoolPublicWorktreeInstance,
    _operation: SpoolChecksReadOperation,
    signal: AbortSignal
  ): Promise<SpoolChecksReadResult> {
    if (target.ownerWorktree.kind !== 'git') {
      throw new SpoolExecutionError('method_not_found')
    }
    return await this.cache.read(
      target,
      signal,
      async (loaderSignal) => await this.readUncached(target, loaderSignal)
    )
  }

  private async readUncached(
    target: SpoolPublicWorktreeInstance,
    signal: AbortSignal
  ): Promise<SpoolChecksReadResult> {
    try {
      return SpoolChecksReadResultSchema.parse(await this.readOwnerProjection(target, signal))
    } catch {
      signal.throwIfAborted()
      // Why: provider and host errors must collapse to a bounded status without raw error material.
      return unavailableChecksResult()
    }
  }

  private async readOwnerProjection(
    target: SpoolPublicWorktreeInstance,
    signal: AbortSignal
  ): Promise<SpoolChecksReadResult> {
    const status = await this.runtime.getRuntimeGitStatus(`id:${target.worktreeId}`, { signal })
    const branch = status.branch?.trim()
    const meta = this.store.getWorktreeMeta(target.worktreeId)
    const linkedReviewNumbers = [
      meta?.linkedPR,
      meta?.linkedGitLabMR,
      meta?.linkedBitbucketPR,
      meta?.linkedAzureDevOpsPR,
      meta?.linkedGiteaPR
    ]
    if (!branch && linkedReviewNumbers.every((number) => number == null)) {
      return completeEmptyChecksResult()
    }
    const review = await this.runtime.getHostedReviewForBranch({
      repoSelector: `id:${target.ownerWorktree.repoId}`,
      branch: branch ?? '',
      currentHeadOid: status.head ?? null,
      linkedGitHubPR: meta?.linkedPR ?? null,
      linkedGitLabMR: meta?.linkedGitLabMR ?? null,
      linkedBitbucketPR: meta?.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: meta?.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: meta?.linkedGiteaPR ?? null,
      recordStats: false,
      throwOnProviderError: true,
      signal
    })
    if (!review) {
      return completeEmptyChecksResult()
    }
    let checkDetails: Awaited<ReturnType<SpoolChecksRuntime['getRepoPRChecks']>> = []
    let detailStatus: SpoolChecksReadResult['detailStatus'] = 'unsupported'
    if (review.provider === 'github') {
      try {
        checkDetails = await this.runtime.getRepoPRChecks(
          `id:${target.ownerWorktree.repoId}`,
          review.number,
          review.headSha,
          null,
          { signal }
        )
        detailStatus = 'complete'
      } catch {
        signal.throwIfAborted()
        // Why: review summary remains useful when the provider's detail endpoint is unavailable.
        detailStatus = 'unavailable'
      }
    }
    return {
      review: {
        provider: review.provider,
        number: review.number,
        title: boundDisplayText(review.title, 1_024, `Review #${review.number}`),
        state: review.state,
        url: normalizeSpoolChecksHttpUrl(review.url),
        status: review.status,
        updatedAt: boundText(review.updatedAt, 256),
        mergeable: review.mergeable,
        reviewDecision: review.reviewDecision ?? null
      },
      checks: checkDetails.slice(0, MAX_CHECKS).map((check) => ({
        name: boundDisplayText(check.name, 1_024, 'Check'),
        status: check.status,
        conclusion: check.conclusion,
        url: check.url ? normalizeSpoolChecksHttpUrl(check.url) : null
      })),
      truncated: checkDetails.length > MAX_CHECKS,
      detailStatus
    }
  }
}

function boundText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength)
}

function boundDisplayText(value: string, maxLength: number, fallback: string): string {
  let normalized = ''
  for (const character of boundText(value, maxLength)) {
    const codePoint = character.codePointAt(0) ?? 0
    normalized += codePoint <= 0x1f || codePoint === 0x7f ? ' ' : character
  }
  return normalized.trim() || fallback
}

function completeEmptyChecksResult(): SpoolChecksReadResult {
  return { review: null, checks: [], truncated: false, detailStatus: 'complete' }
}

function unavailableChecksResult(): SpoolChecksReadResult {
  return { review: null, checks: [], truncated: false, detailStatus: 'unavailable' }
}
