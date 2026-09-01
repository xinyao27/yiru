import type { HostedReviewCreationProvider } from '@yiru/runtime-protocol/model/review'
import {
  isNoUpstreamError,
  normalizeGitErrorMessage
} from '@yiru/runtime-protocol/workbench/git/remote-error'
import {
  normalizeHostedReviewBaseRef,
  normalizeHostedReviewHeadRef
} from '@yiru/runtime-protocol/workbench/hosted-review-refs'
import type { GitUpstreamStatus } from '@yiru/runtime-protocol/workbench/types'

import { isAzureDevOpsReviewCreationAuthenticated } from '../azure-devops/pull-request-creation'
import { resolveDefaultBaseRefViaExec } from '../git/repo/repo'
import { getUpstreamStatus } from '../git/repo/upstream'
import { gitOptionalLocksDisabledEnv } from '../git/runner/runner'
import { parsePorcelainV1Records, type PorcelainV1Record } from '../git/status/porcelain-v1-records'
import { isGiteaReviewCreationAuthenticated } from '../gitea/pull-request-creation'
import { getEnterpriseGitHubRepoSlug } from '../github/enterprise-repository'
import { acquire, ghExecFileAsync, gitExecFileAsync, release } from '../github/github-cli'
import { getProjectSlug } from '../gitlab/client'
import {
  acquire as acquireGlab,
  glabExecFileAsync,
  glabRepoExecOptions,
  release as releaseGlab
} from '../gitlab/gitlab-cli'
import { findExistingWorktreeSymlinkPaths } from '../worktree/symlink-detection'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from './hosted-review-git-options'

export function stripHostedReviewRefPrefix(ref: string): string {
  return normalizeHostedReviewHeadRef(ref)
}

export function hostedReviewExecutionContext(
  options: HostedReviewExecutionOptions = {}
): HostedReviewExecutionOptions {
  const localGitExecOptions = getHostedReviewLocalGitOptions(options)
  return Object.keys(localGitExecOptions).length > 0 ? { localGitExecOptions } : {}
}

async function isGitHubAuthenticated(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<boolean> {
  // Why: a detected GHES slug already proves gh enterprise authentication.
  if (await getEnterpriseGitHubRepoSlug(repoPath, connectionId, options)) {
    return true
  }
  await acquire()
  try {
    await ghExecFileAsync(['auth', 'status', '--hostname', 'github.com'], {
      cwd: repoPath,
      ...getHostedReviewLocalGitOptions(options)
    })
    return true
  } catch {
    return false
  } finally {
    release()
  }
}

async function isGitLabAuthenticated(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<boolean> {
  const projectRef = await getProjectSlug(repoPath, connectionId, options)
  if (!projectRef) {
    return false
  }
  await acquireGlab()
  try {
    await glabExecFileAsync(['auth', 'status', '--hostname', projectRef.host], {
      ...glabRepoExecOptions(repoPath, connectionId),
      ...getHostedReviewLocalGitOptions(options)
    })
    return true
  } catch {
    return false
  } finally {
    releaseGlab()
  }
}

async function runGitForHostedReview(
  repoPath: string,
  args: string[],
  options: HostedReviewExecutionOptions = {}
): Promise<{ stdout: string; stderr?: string }> {
  return gitExecFileAsync(args, { cwd: repoPath, ...getHostedReviewLocalGitOptions(options) })
}

export function getDefaultHostedReviewBaseRef(
  repoPath: string,
  options: HostedReviewExecutionOptions = {}
): Promise<string | null> {
  return resolveDefaultBaseRefViaExec((argv) => runGitForHostedReview(repoPath, argv, options))
}

export async function hostedReviewBaseExistsOnRemote(
  candidate: string,
  repoPath: string,
  options: HostedReviewExecutionOptions = {}
): Promise<boolean> {
  const base = normalizeHostedReviewBaseRef(candidate).trim()
  if (!base) {
    return false
  }
  const patterns = [`refs/remotes/*/${base}`]
  if (base.includes('/')) {
    patterns.push(`refs/remotes/${base}`)
  }
  try {
    const { stdout } = await runGitForHostedReview(
      repoPath,
      ['for-each-ref', '--count=1', '--format=%(refname)', ...patterns],
      options
    )
    return stdout.trim().length > 0
  } catch {
    // Why: a transport failure is not evidence that a legitimate base is absent.
    return true
  }
}

export async function getCurrentHostedReviewBranch(
  repoPath: string,
  options: HostedReviewExecutionOptions = {}
): Promise<string> {
  const { stdout } = await runGitForHostedReview(
    repoPath,
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    options
  )
  return stripHostedReviewRefPrefix(stdout.trim())
}

async function anyRecordIsUserDirt(
  worktreePath: string,
  records: readonly PorcelainV1Record[],
  sharedLinkPaths: readonly string[]
): Promise<boolean> {
  if (sharedLinkPaths.length === 0 || !records.some((record) => record.xy === '??')) {
    return true
  }
  const sharedLinks = new Set(await findExistingWorktreeSymlinkPaths(worktreePath, sharedLinkPaths))
  return records.some((record) => record.xy !== '??' || !sharedLinks.has(record.path))
}

export async function hasHostedReviewUncommittedChanges(
  repoPath: string,
  options: HostedReviewExecutionOptions = {}
): Promise<boolean> {
  const { stdout } = await gitExecFileAsync(['status', '--porcelain', '-z'], {
    cwd: repoPath,
    ...getHostedReviewLocalGitOptions(options),
    // Why: validation must not take Git's optional index lock during terminal work.
    env: gitOptionalLocksDisabledEnv()
  })
  const records = parsePorcelainV1Records(stdout)
  return records.length > 0 && anyRecordIsUserDirt(repoPath, records, options.sharedLinkPaths ?? [])
}

export async function getHostedReviewUpstreamStatus(
  repoPath: string,
  options: HostedReviewExecutionOptions = {}
): Promise<GitUpstreamStatus> {
  try {
    return await getUpstreamStatus(repoPath, undefined, getHostedReviewLocalGitOptions(options))
  } catch (error) {
    if (isNoUpstreamError(error)) {
      return { hasUpstream: false, ahead: 0, behind: 0 }
    }
    throw new Error(normalizeGitErrorMessage(error, 'upstream'))
  }
}

export async function isHostedReviewProviderAuthenticated(
  provider: HostedReviewCreationProvider,
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<boolean> {
  if (provider === 'gitlab') {
    return isGitLabAuthenticated(repoPath, connectionId, options)
  }
  if (provider === 'azure-devops') {
    return isAzureDevOpsReviewCreationAuthenticated()
  }
  if (provider === 'gitea') {
    return isGiteaReviewCreationAuthenticated()
  }
  return isGitHubAuthenticated(repoPath, connectionId, options)
}
