import type {
  ForgeRemotePreference,
  GitLabDiscussionResolveResult,
  GitLabMRInlineCommentInput,
  MRComment
} from '@yiru/runtime-protocol/workbench/types'

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

export async function addMRInlineComment(
  repoPath: string,
  iid: number,
  input: GitLabMRInlineCommentInput,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true; comment: MRComment } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true; comment: MRComment } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      const body = input.body.trim()
      if (!body) {
        return { ok: false, error: 'Comment body is required' }
      }
      await acquire()
      try {
        const oldPath = input.oldPath ?? input.path
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'POST',
            `projects/${encodeGitLabProject(projectRef.path)}/merge_requests/${iid}/discussions`,
            '-f',
            `body=${body}`,
            '-f',
            'position[position_type]=text',
            '-f',
            `position[base_sha]=${input.baseSha}`,
            '-f',
            `position[start_sha]=${input.startSha}`,
            '-f',
            `position[head_sha]=${input.headSha}`,
            '-f',
            `position[old_path]=${oldPath}`,
            '-f',
            `position[new_path]=${input.path}`,
            '-f',
            `position[new_line]=${input.line}`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const data = JSON.parse(stdout) as {
          id?: string
          notes?: {
            id?: number
            author?: { username?: string; avatar_url?: string; state?: string } | null
            body?: string
            created_at?: string
            position?: { new_path?: string; new_line?: number } | null
          }[]
        }
        const note = data.notes?.[0]
        return {
          ok: true,
          comment: {
            id: note?.id ?? Date.now(),
            author: note?.author?.username ?? 'You',
            authorAvatarUrl: note?.author?.avatar_url ?? '',
            body: note?.body ?? body,
            createdAt: note?.created_at ?? new Date().toISOString(),
            url: '',
            threadId: data.id,
            isResolved: false,
            isBot: note?.author?.state === 'bot',
            path: note?.position?.new_path ?? input.path,
            line: note?.position?.new_line ?? input.line
          }
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

export async function resolveMRDiscussion(
  repoPath: string,
  iid: number,
  discussionId: string,
  resolved: boolean,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabDiscussionResolveResult> {
  return withProjectRef<GitLabDiscussionResolveResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      const trimmedDiscussionId = discussionId.trim()
      if (!trimmedDiscussionId) {
        return { ok: false, error: 'Discussion id is required' }
      }
      await acquire()
      try {
        // Why: GitLab resolves/reopens the whole discussion thread, not a single
        // note; this mirrors GitHub's thread-level resolve mutation.
        await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'PUT',
            `projects/${encodeGitLabProject(projectRef.path)}/merge_requests/${iid}/discussions/${encodeURIComponent(trimmedDiscussionId)}`,
            '-f',
            `resolved=${resolved ? 'true' : 'false'}`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
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
