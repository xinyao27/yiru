import type { ForgeRemotePreference, MRComment } from '~shared/types'

import {
  acquire,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release,
  type LocalGitExecOptions,
  type ProjectRef
} from './gitlab-cli'
import { encodeGitLabProject, withProjectRef } from './project-context'

// ── MR mutations ──────────────────────────────────────────────────
// Why: mirror the GitHub-side review actions for the GitLab dialog footer. All take a
// repoPath + iid and resolve the project ref via the existing helper.

export async function closeMR(
  repoPath: string,
  iid: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        await glabExecFileAsync(
          [
            'mr',
            'close',
            String(iid),
            '-R',
            repoFlag,
            ...glabHostnameArgs(projectRef, connectionId)
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Why: glab returns a non-zero exit when the MR is already
        // closed — treat that as success since the desired state is
        // reached.
        if (msg.toLowerCase().includes('already')) {
          return { ok: true }
        }
        return { ok: false, error: msg }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function reopenMR(
  repoPath: string,
  iid: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        await glabExecFileAsync(
          [
            'mr',
            'reopen',
            String(iid),
            '-R',
            repoFlag,
            ...glabHostnameArgs(projectRef, connectionId)
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('already')) {
          return { ok: true }
        }
        return { ok: false, error: msg }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function mergeMR(
  repoPath: string,
  iid: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge',
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        // Why: glab mr merge accepts --squash and --rebase flags;
        // omitting both does a regular merge commit. Map our union
        // to the right glab flag.
        const methodFlag =
          method === 'squash' ? ['--squash'] : method === 'rebase' ? ['--rebase'] : []
        await glabExecFileAsync(
          [
            'mr',
            'merge',
            String(iid),
            '-R',
            repoFlag,
            '--yes',
            ...methodFlag,
            ...glabHostnameArgs(projectRef, connectionId)
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function addMRComment(
  repoPath: string,
  iid: number,
  body: string,
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
      await acquire()
      try {
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'POST',
            `projects/${encodeGitLabProject(projectRef.path)}/merge_requests/${iid}/notes`,
            '-f',
            `body=${body}`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const data = JSON.parse(stdout) as {
          id?: number
          author?: { username?: string; avatar_url?: string; state?: string } | null
          body?: string
          created_at?: string
        }
        return {
          ok: true,
          comment: {
            id: data.id ?? Date.now(),
            author: data.author?.username ?? 'You',
            authorAvatarUrl: data.author?.avatar_url ?? '',
            body: data.body ?? body,
            createdAt: data.created_at ?? new Date().toISOString(),
            url: '',
            isBot: data.author?.state === 'bot'
          }
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}
