import type { GitHubWorkItem, GitHubWorkItemDetails, PRCheckDetail } from '../../shared/types'
import { getPRChecks, getPRComments, getWorkItem } from './client'
import {
  acquire,
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext,
  release,
  type LocalGitExecOptions
} from './gh-utils'
import {
  getPullRequestFiles,
  getPullRequestFileViewedStates,
  getPullRequestHeadBaseSha,
  mergePullRequestFileViewedStates
} from './pull-request-file-list'
import {
  enrichPullRequestDisplayAvatars,
  getPullRequestMentionParticipants,
  getPullRequestParticipants
} from './pull-request-participants'

export { getPRFileContents } from './pull-request-file-contents'

function localGitOptionArgs(options: LocalGitExecOptions = {}): [] | [LocalGitExecOptions] {
  return Object.keys(options).length > 0 ? [options] : []
}

async function getPullRequestBody(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = await getOwnerRepo(
    repoPath,
    connectionId,
    ...localGitOptionArgs(localGitOptions)
  )
  try {
    if (ownerRepo) {
      const { stdout } = await ghExecFileAsync(
        ['api', '--cache', '60s', `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${prNumber}`],
        ghOptions
      )
      return (JSON.parse(stdout) as { body?: string | null }).body ?? ''
    }
    const { stdout } = await ghExecFileAsync(
      ['pr', 'view', String(prNumber), '--json', 'body'],
      ghOptions
    )
    return (JSON.parse(stdout) as { body?: string }).body ?? ''
  } catch {
    return ''
  }
}

async function getPullRequestChecksForDetails(
  repoPath: string,
  prNumber: number,
  headSha: string | undefined,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<PRCheckDetail[]> {
  try {
    return await getPRChecks(
      repoPath,
      prNumber,
      headSha,
      null,
      undefined,
      connectionId,
      ...localGitOptionArgs(localGitOptions)
    )
  } catch (error) {
    // Why: auxiliary check failures must not block the review conversation and files.
    console.warn('getWorkItemDetails PR checks failed:', error)
    return []
  }
}

export async function getWorkItemDetails(
  repoPath: string,
  number: number,
  type?: 'pr',
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubWorkItemDetails | null> {
  // Why: the lightweight lookup owns its semaphore; rich detail fetches acquire afterward.
  const item: Omit<GitHubWorkItem, 'repoId'> | null = await getWorkItem(
    repoPath,
    number,
    type,
    connectionId,
    ...localGitOptionArgs(localGitOptions)
  )
  if (!item) {
    return null
  }

  await acquire()
  try {
    const [body, comments, shas, files, viewedStates, participants] = await Promise.all([
      getPullRequestBody(repoPath, item.number, connectionId, localGitOptions),
      getPRComments(
        repoPath,
        item.number,
        undefined,
        connectionId,
        ...localGitOptionArgs(localGitOptions)
      ),
      getPullRequestHeadBaseSha(repoPath, item.number, connectionId, localGitOptions),
      getPullRequestFiles(repoPath, item.number, connectionId, localGitOptions),
      getPullRequestFileViewedStates(repoPath, item.number, connectionId, localGitOptions),
      getPullRequestParticipants(repoPath, item.number, connectionId, localGitOptions)
    ])
    const [mentionParticipants, checks] = await Promise.all([
      getPullRequestMentionParticipants(
        repoPath,
        item,
        comments,
        participants,
        connectionId,
        localGitOptions
      ),
      getPullRequestChecksForDetails(
        repoPath,
        item.number,
        shas?.headSha,
        connectionId,
        localGitOptions
      )
    ])

    return {
      item: enrichPullRequestDisplayAvatars(item, mentionParticipants),
      body,
      comments,
      headSha: shas?.headSha,
      baseSha: shas?.baseSha,
      pullRequestId: viewedStates?.pullRequestId,
      checks,
      // Why: null means the file fetch failed; undefined lets the UI expose retry state.
      files: files === null ? undefined : mergePullRequestFileViewedStates(files, viewedStates),
      filesUnavailable: files === null,
      participants: mentionParticipants
    }
  } finally {
    release()
  }
}
