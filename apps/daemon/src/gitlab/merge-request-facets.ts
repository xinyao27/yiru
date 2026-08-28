import type {
  GitLabAssignableUser,
  GitLabMRApprovalState,
  GitLabMRFile,
  GitLabPipelineJob
} from '@yiru/runtime-protocol/workbench/types'

import {
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  type LocalGitExecOptions,
  type ProjectRef
} from './gitlab-cli'
import { encodeGitLabProjectPath } from './project-api-path'

export type GitLabRawUser = {
  id?: number
  username?: string | null
  name?: string | null
  avatar_url?: string | null
  state?: string | null
}

type GitLabRawJob = {
  id?: number
  name?: string
  stage?: string
  status?: string
  web_url?: string
  duration?: number | null
}

export function mapGitLabUser(raw: GitLabRawUser | null | undefined): GitLabAssignableUser | null {
  if (!raw?.username) {
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

export async function fetchGitLabPipelineJobs(
  repoPath: string,
  projectRef: ProjectRef,
  pipelineId: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabPipelineJob[]> {
  const { stdout } = await glabExecFileAsync(
    [
      'api',
      ...glabHostnameArgs(projectRef, connectionId),
      // Why: the first 100 jobs match the visible summary budget.
      `projects/${encodeGitLabProjectPath(projectRef.path)}/pipelines/${pipelineId}/jobs?per_page=100`
    ],
    glabRepoExecOptions(repoPath, connectionId, localGitOptions)
  )
  const data = JSON.parse(stdout) as GitLabRawJob[]
  return data.map((raw) => ({
    id: raw.id ?? 0,
    pipelineId,
    name: raw.name ?? '',
    stage: raw.stage ?? '',
    status: raw.status ?? '',
    webUrl: raw.web_url ?? '',
    duration: typeof raw.duration === 'number' ? raw.duration : null
  }))
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue
    }
    if (line.startsWith('+')) {
      additions += 1
    } else if (line.startsWith('-')) {
      deletions += 1
    }
  }
  return { additions, deletions }
}

function mapGitLabMergeRequestFile(raw: {
  new_path?: string
  old_path?: string
  diff?: string
  new_file?: boolean
  deleted_file?: boolean
  renamed_file?: boolean
  binary?: boolean
  too_large?: boolean
}): GitLabMRFile {
  const diff = raw.diff ?? ''
  const counts = countDiffLines(diff)
  const status = raw.new_file
    ? 'added'
    : raw.deleted_file
      ? 'removed'
      : raw.renamed_file
        ? 'renamed'
        : 'modified'
  return {
    path: raw.new_path ?? raw.old_path ?? '',
    ...(raw.old_path && raw.old_path !== raw.new_path ? { oldPath: raw.old_path } : {}),
    status,
    additions: counts.additions,
    deletions: counts.deletions,
    isBinary: Boolean(raw.binary || raw.too_large || !diff),
    ...(diff ? { diff } : {})
  }
}

export async function fetchGitLabMergeRequestFiles(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabMRFile[]> {
  const { stdout } = await glabExecFileAsync(
    [
      'api',
      ...glabHostnameArgs(projectRef, connectionId),
      // Why: this paginated endpoint replaces GitLab's deprecated changes endpoint.
      `projects/${encodeGitLabProjectPath(projectRef.path)}/merge_requests/${iid}/diffs?per_page=100`
    ],
    glabRepoExecOptions(repoPath, connectionId, localGitOptions)
  )
  const data = JSON.parse(stdout) as Parameters<typeof mapGitLabMergeRequestFile>[0][]
  return data.map(mapGitLabMergeRequestFile).filter((file) => file.path)
}

export async function fetchGitLabMergeRequestReviewers(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabAssignableUser[]> {
  const { stdout } = await glabExecFileAsync(
    [
      'api',
      ...glabHostnameArgs(projectRef, connectionId),
      `projects/${encodeGitLabProjectPath(projectRef.path)}/merge_requests/${iid}/reviewers`
    ],
    glabRepoExecOptions(repoPath, connectionId, localGitOptions)
  )
  const data = JSON.parse(stdout) as { user?: GitLabRawUser | null }[]
  return data
    .map((entry) => mapGitLabUser(entry.user))
    .filter((user): user is GitLabAssignableUser => Boolean(user))
}

export async function fetchGitLabMergeRequestApprovalState(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabMRApprovalState | undefined> {
  const projectPath = encodeGitLabProjectPath(projectRef.path)
  const [approvalsResult, stateResult] = await Promise.allSettled([
    glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${projectPath}/merge_requests/${iid}/approvals`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    ),
    glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${projectPath}/merge_requests/${iid}/approval_state`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
  ])
  if (approvalsResult.status === 'rejected' && stateResult.status === 'rejected') {
    return undefined
  }
  const approvals =
    approvalsResult.status === 'fulfilled'
      ? (JSON.parse(approvalsResult.value.stdout) as {
          approvals_required?: number | null
          approvals_left?: number | null
          approved_by?: { user?: GitLabRawUser | null }[]
        })
      : null
  const state =
    stateResult.status === 'fulfilled'
      ? (JSON.parse(stateResult.value.stdout) as {
          rules?: { id?: number; name?: string; approvals_required?: number; approved?: boolean }[]
        })
      : null
  return {
    approvalsRequired:
      typeof approvals?.approvals_required === 'number' ? approvals.approvals_required : null,
    approvalsLeft: typeof approvals?.approvals_left === 'number' ? approvals.approvals_left : null,
    approvedBy: (approvals?.approved_by ?? [])
      .map((entry) => mapGitLabUser(entry.user))
      .filter((user): user is GitLabAssignableUser => Boolean(user)),
    rules: (state?.rules ?? []).map((rule) => ({
      id: rule.id ?? 0,
      name: rule.name ?? 'Approval rule',
      approvalsRequired: rule.approvals_required ?? 0,
      approved: Boolean(rule.approved)
    }))
  }
}
