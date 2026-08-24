import type { MRInfo } from '~shared/types'

import { extractExecError } from '../git/runner'
import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'
import type { HostedReviewLookupOptions } from '../source-control/hosted-review-lookup-options'
import {
  acquire,
  classifyGlabError,
  getGlabKnownHosts,
  getProjectRef,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release
} from './gitlab-cli'
import { derivePipelineStatus, mapMRInfo } from './mappers'
import { encodeGitLabProject, hostedReviewLocalGitOptionArgs } from './project-context'

const GITLAB_BRANCH_LOOKUP_TIMEOUT_MS = 10_000

/**
 * Fetch a single merge request with the pipeline status rolled up.
 * Returns null when the MR doesn't exist or glab fails — callers
 * decide whether to surface "not found" UI.
 */
export async function getMergeRequest(
  repoPath: string,
  iid: number,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<MRInfo | null> {
  const knownHosts = await getGlabKnownHosts(connectionId)
  const localGitArgs = hostedReviewLocalGitOptionArgs(options)
  const localGitOptions = localGitArgs[0] ?? {}
  const projectRef = await getProjectRef(repoPath, knownHosts, connectionId, ...localGitArgs)
  await acquire()
  try {
    const args = projectRef
      ? [
          'api',
          ...glabHostnameArgs(projectRef, connectionId),
          `projects/${encodeGitLabProject(projectRef.path)}/merge_requests/${iid}`
        ]
      : ['mr', 'view', String(iid), '--output', 'json']
    const { stdout } = await glabExecFileAsync(
      args,
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as Parameters<typeof mapMRInfo>[0] & {
      head_pipeline?: { status?: string } | null
      pipeline?: { status?: string } | null
    }
    // Why: GitLab's MR detail surfaces the head pipeline directly.
    // Older instances expose `pipeline` instead of `head_pipeline` — try
    // both. If neither is set the rollup falls back to neutral.
    const pipelineStatus = derivePipelineStatus(data.head_pipeline ?? data.pipeline ?? null)
    return mapMRInfo(data, pipelineStatus)
  } catch {
    return null
  } finally {
    release()
  }
}

/**
 * Find the merge request whose source branch matches the given branch
 * name. Mirrors github/getPRForBranch — returns the most recently
 * updated MR for the branch, or null when none exists. The branch is the
 * local checkout's current ref (Yiru strips refs/heads/ prefix upstream
 * so we don't need to here).
 */
export async function getMergeRequestForBranch(
  repoPath: string,
  branch: string,
  linkedMRIid?: number | null,
  connectionId?: string | null,
  options: HostedReviewLookupOptions = {}
): Promise<MRInfo | null> {
  const branchName = branch.replace(/^refs\/heads\//, '')
  if (!branchName && linkedMRIid == null) {
    return null
  }
  options.signal?.throwIfAborted()
  const knownHosts = options.signal
    ? await getGlabKnownHosts(connectionId, { signal: options.signal })
    : await getGlabKnownHosts(connectionId)
  const localGitArgs = hostedReviewLocalGitOptionArgs(options)
  const localGitOptions = localGitArgs[0] ?? {}
  const projectRef = await getProjectRef(repoPath, knownHosts, connectionId, ...localGitArgs)
  options.signal?.throwIfAborted()
  if (!projectRef) {
    if (options.throwOnProviderError) {
      throw new Error('GitLab project lookup became unavailable.')
    }
    return null
  }
  // Why: the GitLab client has only four shared CLI lanes; one stalled branch
  // lookup must release its lane even when glab's own network timeout does not.
  const timeoutSignal = AbortSignal.timeout(GITLAB_BRANCH_LOOKUP_TIMEOUT_MS)
  const lookupSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal
  await acquire(lookupSignal)
  let exactLinkedLookup = false
  const lookupExecOptions = {
    ...glabRepoExecOptions(repoPath, connectionId, localGitOptions),
    signal: lookupSignal
  }
  try {
    if (branchName) {
      const { stdout } = await glabExecFileAsync(
        [
          'api',
          ...glabHostnameArgs(projectRef, connectionId),
          `projects/${encodeGitLabProject(projectRef.path)}/merge_requests?source_branch=${encodeURIComponent(branchName)}&order_by=updated_at&sort=desc&per_page=1`
        ],
        lookupExecOptions
      )
      const data = JSON.parse(stdout) as (Parameters<typeof mapMRInfo>[0] & {
        head_pipeline?: { status?: string } | null
        pipeline?: { status?: string } | null
      })[]
      if (Array.isArray(data) && data.length > 0) {
        const raw = data[0]
        // Why: older GitLab list payloads expose `pipeline` instead of
        // `head_pipeline`, matching the detail endpoint compatibility path.
        const pipelineStatus = derivePipelineStatus(raw.head_pipeline ?? raw.pipeline ?? null)
        return mapMRInfo(raw, pipelineStatus)
      }
    }
    if (typeof linkedMRIid !== 'number') {
      return null
    }
    // Why: create-from-MR worktrees may use a fresh local branch name rather
    // than the MR source branch. Fall back to the durable linked iid so the
    // core review status still follows the workspace.
    exactLinkedLookup = true
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodeGitLabProject(projectRef.path)}/merge_requests/${linkedMRIid}`
      ],
      lookupExecOptions
    )
    const raw = JSON.parse(stdout) as Parameters<typeof mapMRInfo>[0] & {
      head_pipeline?: { status?: string } | null
      pipeline?: { status?: string } | null
    }
    const pipelineStatus = derivePipelineStatus(raw.head_pipeline ?? raw.pipeline ?? null)
    return mapMRInfo(raw, pipelineStatus)
  } catch (error) {
    // Why: a linked exact-id 404 is a stale link; branch-list failures remain unavailable.
    if (options.throwOnProviderError && !(exactLinkedLookup && isGitLabNotFoundError(error))) {
      throw error
    }
    return null
  } finally {
    release()
  }
}

function isGitLabNotFoundError(error: unknown): boolean {
  const output = extractExecError(error)
  return classifyGlabError(`${output.stderr}\n${output.stdout}`).type === 'not_found'
}
