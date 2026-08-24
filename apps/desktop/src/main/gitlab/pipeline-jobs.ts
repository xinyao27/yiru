import type {
  ForgeRemotePreference,
  GitLabAssignableUser,
  GitLabJobTraceResult,
  GitLabMRReviewersUpdateResult,
  GitLabPipelineJob,
  GitLabRetryJobResult
} from '~shared/types'

import {
  acquire,
  classifyGlabError,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release,
  type LocalGitExecOptions,
  type ProjectRef
} from './gitlab-cli'
import { encodeGitLabProject, withProjectRef } from './project-context'

function mapRetriedPipelineJob(
  data: {
    id?: number
    pipeline?: { id?: number | null } | null
    name?: string
    stage?: string
    status?: string
    web_url?: string
    duration?: number | null
  },
  fallbackJobId: number
): GitLabPipelineJob {
  return {
    id: data.id ?? fallbackJobId,
    ...(typeof data.pipeline?.id === 'number' ? { pipelineId: data.pipeline.id } : {}),
    name: data.name ?? '',
    stage: data.stage ?? '',
    status: data.status ?? '',
    webUrl: data.web_url ?? '',
    duration: typeof data.duration === 'number' ? data.duration : null
  }
}

function mapGitLabReviewer(raw: {
  id?: number
  username?: string | null
  name?: string | null
  avatar_url?: string | null
  state?: string | null
}): GitLabAssignableUser | null {
  if (!raw.username) {
    return null
  }
  return {
    ...(typeof raw.id === 'number' ? { id: raw.id } : {}),
    username: raw.username,
    name: raw.name ?? null,
    avatarUrl: raw.avatar_url ?? '',
    ...(raw.state !== undefined ? { state: raw.state } : {})
  }
}

export async function updateMRReviewers(
  repoPath: string,
  iid: number,
  reviewerIds: number[],
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabMRReviewersUpdateResult> {
  return withProjectRef<GitLabMRReviewersUpdateResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      await acquire()
      try {
        const fields =
          reviewerIds.length > 0
            ? reviewerIds.flatMap((id) => ['-f', `reviewer_ids[]=${id}`])
            : ['-f', 'reviewer_ids=']
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'PUT',
            `projects/${encodeGitLabProject(projectRef.path)}/merge_requests/${iid}`,
            ...fields
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const data = JSON.parse(stdout) as { reviewers?: Parameters<typeof mapGitLabReviewer>[0][] }
        return {
          ok: true,
          reviewers: (data.reviewers ?? [])
            .map(mapGitLabReviewer)
            .filter((u): u is GitLabAssignableUser => !!u)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function getJobTrace(
  repoPath: string,
  jobId: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabJobTraceResult> {
  return withProjectRef<GitLabJobTraceResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      await acquire()
      try {
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            `projects/${encodeGitLabProject(projectRef.path)}/jobs/${jobId}/trace`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true, trace: stdout }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function retryJob(
  repoPath: string,
  jobId: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabRetryJobResult> {
  return withProjectRef<GitLabRetryJobResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      await acquire()
      try {
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'POST',
            `projects/${encodeGitLabProject(projectRef.path)}/jobs/${jobId}/retry`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const trimmed = stdout.trim()
        return {
          ok: true,
          ...(trimmed ? { job: mapRetriedPipelineJob(JSON.parse(trimmed), jobId) } : {})
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}
