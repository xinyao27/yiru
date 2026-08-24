import type { GitLabAssignableUser, GitLabWorkItem, GitLabWorkItemDetails } from '~shared/types'
import type { ForgeRemotePreference } from '~shared/types'

import {
  acquire,
  getGlabKnownHosts,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release,
  resolveProjectRemote,
  type LocalGitExecOptions,
  type ProjectRef
} from './gitlab-cli'
import { mapMRToWorkItem } from './mappers'
import {
  fetchGitLabMergeRequestApprovalState,
  fetchGitLabMergeRequestFiles,
  fetchGitLabMergeRequestReviewers,
  fetchGitLabPipelineJobs,
  mapGitLabUser,
  type GitLabRawUser
} from './merge-request-facets'
import { encodeGitLabProjectPath } from './project-api-path'
import { fetchGitLabDiscussions, flattenGitLabDiscussions } from './work-item-discussions'

type GitLabRawMergeRequest = Parameters<typeof mapMRToWorkItem>[0] & {
  description?: string | null
  sha?: string
  diff_refs?: { base_sha?: string; head_sha?: string; start_sha?: string } | null
  head_pipeline?: { id?: number } | null
  reviewers?: GitLabRawUser[] | null
}

export async function getWorkItemDetails(
  repoPath: string,
  iid: number,
  _type: 'mr',
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRefOverride?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabWorkItemDetails | null> {
  // Why: detail fetches must use the project source of the row that opened them.
  const projectRef =
    projectRefOverride ??
    (
      await resolveProjectRemote(
        repoPath,
        preference,
        await getGlabKnownHosts(connectionId),
        connectionId,
        localGitOptions
      )
    ).source
  if (!projectRef) {
    return null
  }
  await acquire()
  try {
    return await fetchMergeRequestDetails(repoPath, projectRef, iid, connectionId, localGitOptions)
  } catch {
    return null
  } finally {
    release()
  }
}

async function fetchMergeRequestDetails(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabWorkItemDetails> {
  const [mergeRequestResult, discussions] = await Promise.all([
    glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodeGitLabProjectPath(projectRef.path)}/merge_requests/${iid}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    ),
    fetchGitLabDiscussions(repoPath, projectRef, iid, connectionId, localGitOptions)
  ])
  const raw = JSON.parse(mergeRequestResult.stdout) as GitLabRawMergeRequest
  const item: Omit<GitLabWorkItem, 'repoId'> = (() => {
    const mapped = mapMRToWorkItem(raw, projectRef.path, projectRef)
    const { repoId: _repoId, ...withoutRepoId } = mapped
    return withoutRepoId
  })()
  const pipelineId = raw.head_pipeline?.id
  const pipelineJobs =
    typeof pipelineId === 'number'
      ? await fetchGitLabPipelineJobs(
          repoPath,
          projectRef,
          pipelineId,
          connectionId,
          localGitOptions
        ).catch(() => [])
      : undefined
  const [reviewers, approvalState, files] = await Promise.all([
    fetchGitLabMergeRequestReviewers(
      repoPath,
      projectRef,
      iid,
      connectionId,
      localGitOptions
    ).catch(() =>
      (raw.reviewers ?? [])
        .map(mapGitLabUser)
        .filter((user): user is GitLabAssignableUser => Boolean(user))
    ),
    fetchGitLabMergeRequestApprovalState(
      repoPath,
      projectRef,
      iid,
      connectionId,
      localGitOptions
    ).catch(() => undefined),
    fetchGitLabMergeRequestFiles(repoPath, projectRef, iid, connectionId, localGitOptions).catch(
      () => []
    )
  ])
  return {
    item,
    body: raw.description ?? '',
    comments: flattenGitLabDiscussions(discussions),
    headSha: raw.sha,
    baseSha: raw.diff_refs?.base_sha,
    startSha: raw.diff_refs?.start_sha,
    files,
    ...(pipelineJobs !== undefined ? { pipelineJobs } : {}),
    reviewers,
    ...(approvalState ? { approvalState } : {})
  }
}
