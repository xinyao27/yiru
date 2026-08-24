import type { MRComment } from '~shared/types'

import {
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  type LocalGitExecOptions,
  type ProjectRef
} from './gitlab-cli'
import { encodeGitLabProjectPath } from './project-api-path'

type GitLabRawNote = {
  id?: number
  body?: string
  author?: { username?: string | null; avatar_url?: string | null; state?: string } | null
  created_at?: string
  system?: boolean
  resolvable?: boolean
  resolved?: boolean
  position?: { new_path?: string; new_line?: number; old_line?: number } | null
}

type GitLabRawDiscussion = {
  id?: string
  individual_note?: boolean
  notes?: GitLabRawNote[]
}

export function flattenGitLabDiscussions(discussions: GitLabRawDiscussion[]): MRComment[] {
  const comments: MRComment[] = []
  for (const discussion of discussions) {
    for (const note of discussion.notes ?? []) {
      if (note.system === true) {
        // Why: GitLab's generated activity entries would dominate a busy MR conversation.
        continue
      }
      comments.push({
        id: note.id ?? 0,
        author: note.author?.username ?? 'unknown',
        authorAvatarUrl: note.author?.avatar_url ?? '',
        body: note.body ?? '',
        createdAt: note.created_at ?? '',
        url: '',
        isBot: note.author?.state === 'bot',
        ...(discussion.id ? { threadId: discussion.id } : {}),
        ...(note.resolvable === true ? { isResolved: note.resolved === true } : {}),
        ...(note.position?.new_path ? { path: note.position.new_path } : {}),
        ...(typeof note.position?.new_line === 'number' ? { line: note.position.new_line } : {})
      })
    }
  }
  // Why: oldest-first matches gitlab.com's conversation rendering.
  return comments.sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? ''))
}

export async function fetchGitLabDiscussions(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabRawDiscussion[]> {
  const { stdout } = await glabExecFileAsync(
    [
      'api',
      ...glabHostnameArgs(projectRef, connectionId),
      // Why: a bounded recent snapshot avoids retaining every historical note.
      `projects/${encodeGitLabProjectPath(projectRef.path)}/merge_requests/${iid}/discussions?per_page=100`
    ],
    glabRepoExecOptions(repoPath, connectionId, localGitOptions)
  )
  return JSON.parse(stdout) as GitLabRawDiscussion[]
}
