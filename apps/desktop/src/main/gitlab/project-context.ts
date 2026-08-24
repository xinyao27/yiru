import type { ForgeRemotePreference } from '~shared/types'

import {
  getHostedReviewLocalGitOptions,
  hasHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import {
  getGlabKnownHosts,
  getProjectRef,
  resolveProjectRemote,
  type LocalGitExecOptions,
  type ProjectRef
} from './gitlab-cli'

type HostedReviewLocalGitOptions = ReturnType<typeof getHostedReviewLocalGitOptions>

export function encodeGitLabProject(projectPath: string): string {
  return encodeURIComponent(projectPath)
}

export function hostedReviewLocalGitOptionArgs(
  options: HostedReviewExecutionOptions = {}
): [] | [HostedReviewLocalGitOptions] {
  return hasHostedReviewLocalGitOptions(options) ? [getHostedReviewLocalGitOptions(options)] : []
}

/**
 * Resolve a project's full GitLab project ref. Returns null for non-GitLab remotes.
 */
export async function getProjectSlug(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<ProjectRef | null> {
  const knownHosts = options.signal
    ? await getGlabKnownHosts(connectionId, { signal: options.signal })
    : await getGlabKnownHosts(connectionId)
  return getProjectRef(
    repoPath,
    knownHosts,
    connectionId,
    ...hostedReviewLocalGitOptionArgs(options)
  )
}

export async function withProjectRef<T>(
  repoPath: string,
  preference: ForgeRemotePreference | undefined,
  connectionId: string | null | undefined,
  explicitProjectRef: ProjectRef | null | undefined,
  fn: (projectRef: ProjectRef, repoFlag: string) => Promise<T>,
  fallback: T,
  localGitOptions: LocalGitExecOptions = {}
): Promise<T> {
  const projectRef =
    explicitProjectRef ??
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
    return fallback
  }
  return fn(projectRef, projectRef.path)
}
