import { resolveMobileBranchCompareBaseRef } from '~/source-control/branch-base-ref'
import {
  canOpenMobileBranchCompareDiff,
  type MobileGitBranchCompareResult
} from '~/source-control/branch-compare'
import { isMobileGitUnavailable } from '~/source-control/git-status'
import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc, isRuntimeOrpcErrorCode } from '~/transport/runtime-orpc-client'

import { highlightMobileDiffLines, resolveMobileSyntaxLanguage } from '../file-syntax'
import { normalizeMobileDiffComments } from './comments'
import { buildMobileDiffHunks } from './hunks'
import { buildMobileDiffLines } from './lines'
import { buildMobileDiffReviewQueue } from './review-queue'
import type { MobileDiffReviewQueueItem } from './review-queue'
import {
  readMobileBranchCompareResult,
  readMobileGitStatusResult,
  readMobileReviewGitDiffResult,
  readMobileReviewWorktreeMetadata
} from './review-rpc'
import type { ReviewDiffState, ReviewScreenState } from './review-screen-model'
import { reviewDescriptorFromItem } from './review-screen-model'
import { mergeMobileDiffReviewState, normalizeMobileDiffReviewState } from './review-state'

type BranchCompareLoadResult = {
  result: MobileGitBranchCompareResult | null
  error?: string
}

type DiffLoadInput = {
  client: RpcClient
  worktreeId: string
  item: MobileDiffReviewQueueItem
  branchCompare: MobileGitBranchCompareResult | null
}

export async function loadMobileDiffReviewBranchCompare(
  client: RpcClient,
  worktreeId: string
): Promise<BranchCompareLoadResult> {
  try {
    const baseRef = await resolveMobileBranchCompareBaseRef(client, worktreeId)
    if (!baseRef) {
      return { result: null }
    }
    const result = await callRuntimeOrpc(client, (runtime) => runtime.git.branchCompare, {
      worktree: `id:${worktreeId}`,
      baseRef
    })
    const parsed = readMobileBranchCompareResult(result)
    return parsed
      ? { result: parsed }
      : { result: null, error: 'Committed changes response was invalid' }
  } catch (err) {
    if (isMobileGitOrpcUnavailable(err)) {
      return { result: null }
    }
    return { result: null, error: err instanceof Error ? err.message : 'Committed changes failed' }
  }
}

export async function loadMobileDiffReviewSnapshot(
  client: RpcClient,
  worktreeId: string
): Promise<ReviewScreenState> {
  let statusResult: unknown
  try {
    statusResult = await callRuntimeOrpc(client, (runtime) => runtime.git.status, {
      worktree: `id:${worktreeId}`
    })
  } catch (error) {
    if (isMobileGitOrpcUnavailable(error)) {
      return { kind: 'unavailable', message: 'Update Yiru desktop to review changes on mobile.' }
    }
    throw error
  }
  const status = readMobileGitStatusResult(statusResult)
  if (!status) {
    throw new Error('Source control response was invalid')
  }

  const [branch, worktreeResponse] = await Promise.all([
    loadMobileDiffReviewBranchCompare(client, worktreeId),
    callRuntimeOrpc(client, (runtime) => runtime.worktree.show, {
      worktree: `id:${worktreeId}`
    })
  ])

  const metadata = readMobileReviewWorktreeMetadata(worktreeResponse)
  const comments = normalizeMobileDiffComments(metadata.diffComments, worktreeId)
  const normalizedReviewState = normalizeMobileDiffReviewState(metadata.mobileDiffReview)
  const branchEntries =
    branch.result && canOpenMobileBranchCompareDiff(branch.result.summary)
      ? branch.result.entries
      : []
  const queue = buildMobileDiffReviewQueue({
    worktreeId,
    statusEntries: status.entries,
    branchEntries,
    branchHeadOid: branch.result?.summary.headOid,
    branchMergeBase: branch.result?.summary.mergeBase,
    comments,
    reviewState: normalizedReviewState
  })

  return {
    kind: 'ready',
    status,
    branchCompare: branch.result,
    branchError: branch.error,
    comments,
    reviewState: mergeMobileDiffReviewState(
      normalizedReviewState,
      queue.map(reviewDescriptorFromItem),
      Date.now()
    )
  }
}

export async function loadMobileDiffReviewDiff(input: DiffLoadInput): Promise<ReviewDiffState> {
  const { client, worktreeId, item, branchCompare } = input
  let response: unknown
  try {
    response =
      item.scope === 'branch'
        ? await loadBranchFileDiff(client, worktreeId, item, branchCompare)
        : await callRuntimeOrpc(client, (runtime) => runtime.git.diff, {
            worktree: `id:${worktreeId}`,
            filePath: item.filePath,
            staged: item.scope === 'staged'
          })
  } catch (error) {
    if (item.status === 'deleted') {
      return { kind: 'deleted', itemKey: item.key }
    }
    throw error
  }
  const result = readMobileReviewGitDiffResult(response)
  if (!result) {
    throw new Error('Diff response was invalid')
  }
  if (result.kind === 'binary') {
    return { kind: 'binary', itemKey: item.key }
  }
  if (result.kind === 'too-large') {
    return { kind: 'too-large', itemKey: item.key, byteLength: result.byteLength }
  }
  const diff = buildMobileDiffLines(result.originalContent, result.modifiedContent)
  const language = resolveMobileSyntaxLanguage(item.filePath)
  return {
    kind: 'ready',
    itemKey: item.key,
    lines: highlightMobileDiffLines(diff.lines, language),
    hunks: buildMobileDiffHunks(diff.lines),
    truncated: diff.truncated
  }
}

async function loadBranchFileDiff(
  client: RpcClient,
  worktreeId: string,
  item: MobileDiffReviewQueueItem,
  branchCompare: MobileGitBranchCompareResult | null
) {
  const summary = branchCompare?.summary
  if (!summary || !summary.headOid || !summary.mergeBase) {
    throw new Error('Committed diff is unavailable')
  }
  return callRuntimeOrpc(client, (runtime) => runtime.git.branchDiff, {
    worktree: `id:${worktreeId}`,
    filePath: item.filePath,
    ...(item.oldPath ? { oldPath: item.oldPath } : {}),
    compare: {
      baseRef: summary.baseRef,
      ...(summary.baseOid ? { baseOid: summary.baseOid } : {}),
      headOid: summary.headOid,
      mergeBase: summary.mergeBase
    }
  })
}

function isMobileGitOrpcUnavailable(error: unknown): boolean {
  return (
    isRuntimeOrpcErrorCode(error, 'forbidden') ||
    isRuntimeOrpcErrorCode(error, 'method_not_found') ||
    isMobileGitUnavailable(undefined, error instanceof Error ? error.message : undefined)
  )
}
