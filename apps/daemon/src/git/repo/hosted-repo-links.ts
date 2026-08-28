import { getDefaultBaseRef } from './default-base-ref'
import { buildHostedRemoteCommitUrl, buildHostedRemoteFileUrl } from './hosted-remote-url'
import { getRemoteUrl } from './repo-details'

export function getRemoteFileUrl(
  repoPath: string,
  relativePath: string,
  line: number
): string | null {
  const remoteUrl = getRemoteUrl(repoPath)
  if (!remoteUrl) {
    return null
  }

  const defaultBaseRef = getDefaultBaseRef(repoPath)
  if (!defaultBaseRef) {
    return null
  }
  const defaultBranch = defaultBaseRef.replace(/^origin\//, '')

  return buildHostedRemoteFileUrl(remoteUrl, relativePath, defaultBranch, line)
}

/**
 * Build a hosted URL (e.g. GitHub, GitLab, Bitbucket) for a commit. Returns
 * null when the origin remote isn't a recognized host.
 */
export function getRemoteCommitUrl(repoPath: string, sha: string): string | null {
  const remoteUrl = getRemoteUrl(repoPath)
  if (!remoteUrl) {
    return null
  }
  return buildHostedRemoteCommitUrl(remoteUrl, sha)
}
