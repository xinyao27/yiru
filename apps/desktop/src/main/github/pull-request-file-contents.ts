import type { GitHubPRFile, GitHubPRFileContents } from '../../shared/types'
import { isMaxBufferOverflowError } from '../git/max-buffer-overflow'
import {
  acquire,
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext,
  release,
  type LocalGitExecOptions
} from './gh-utils'

// Why: hosted files must exceed the renderer's large-diff threshold before raw fetches stop.
const GITHUB_RAW_CONTENT_MAX_BUFFER_BYTES = 8 * 1024 * 1024

function localGitOptionArgs(options: LocalGitExecOptions = {}): [] | [LocalGitExecOptions] {
  return Object.keys(options).length > 0 ? [options] : []
}

async function fetchContentAtRef(args: {
  repoPath: string
  connectionId?: string | null
  localGitOptions?: LocalGitExecOptions
  owner: string
  repo: string
  path: string
  ref: string
}): Promise<{ content: string; isBinary: boolean; tooLarge?: boolean }> {
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '--cache',
        '300s',
        '-H',
        'Accept: application/vnd.github.raw',
        `repos/${args.owner}/${args.repo}/contents/${encodeURI(args.path)}?ref=${encodeURIComponent(args.ref)}`
      ],
      {
        ...ghRepoExecOptions(
          githubRepoContext(args.repoPath, args.connectionId, args.localGitOptions)
        ),
        maxBuffer: GITHUB_RAW_CONTENT_MAX_BUFFER_BYTES
      }
    )
    if (stdout.slice(0, 2048).includes('\u0000')) {
      return { content: '', isBinary: true }
    }
    return { content: stdout, isBinary: false }
  } catch (error) {
    return isMaxBufferOverflowError(error)
      ? { content: '', isBinary: false, tooLarge: true }
      : { content: '', isBinary: false }
  }
}

export async function getPRFileContents(args: {
  repoPath: string
  connectionId?: string | null
  localGitOptions?: LocalGitExecOptions
  prNumber: number
  path: string
  oldPath?: string
  status: GitHubPRFile['status']
  headSha: string
  baseSha: string
}): Promise<GitHubPRFileContents> {
  const ownerRepo = await getOwnerRepo(
    args.repoPath,
    args.connectionId,
    ...localGitOptionArgs(args.localGitOptions)
  )
  if (!ownerRepo) {
    return {
      original: '',
      modified: '',
      originalIsBinary: false,
      modifiedIsBinary: false
    }
  }

  await acquire()
  try {
    // Why: added and removed files have content on only one side of the comparison.
    const emptyContent: { content: string; isBinary: boolean; tooLarge?: boolean } = {
      content: '',
      isBinary: false
    }
    const original =
      args.status === 'added'
        ? Promise.resolve(emptyContent)
        : fetchContentAtRef({
            repoPath: args.repoPath,
            connectionId: args.connectionId,
            localGitOptions: args.localGitOptions,
            owner: ownerRepo.owner,
            repo: ownerRepo.repo,
            path: args.oldPath ?? args.path,
            ref: args.baseSha
          })
    const modified =
      args.status === 'removed'
        ? Promise.resolve(emptyContent)
        : fetchContentAtRef({
            repoPath: args.repoPath,
            connectionId: args.connectionId,
            localGitOptions: args.localGitOptions,
            owner: ownerRepo.owner,
            repo: ownerRepo.repo,
            path: args.path,
            ref: args.headSha
          })
    const [originalResult, modifiedResult] = await Promise.all([original, modified])

    return {
      original: originalResult.content,
      modified: modifiedResult.content,
      originalIsBinary: originalResult.isBinary,
      modifiedIsBinary: modifiedResult.isBinary,
      originalTooLarge: originalResult.tooLarge,
      modifiedTooLarge: modifiedResult.tooLarge
    }
  } finally {
    release()
  }
}
