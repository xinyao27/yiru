import { stat } from 'node:fs/promises'
import { join, posix, win32 } from 'node:path'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import type { GitWorktreeInfo } from '@yiru/runtime-protocol/workbench/types'
import { decodeGitCQuotedPath } from '~main/git/status/cquoted-path'
import {
  hasUnsupportedRevParsePathFormatEcho,
  isUnsupportedRevParsePathFormatError,
  isUnsupportedWorktreeListZError
} from '~main/git/worktree/worktree-command-capabilities'

import { getLocalGitCapabilityCache } from '../runner/capability-state'
import { gitExecFileAsync, translateWslOutputPaths } from '../runner/runner'
import { resolveGitDir } from '../status/status'
import { getErrorCode, gitExecOptions } from './worktree-exec'
import type { GitWorktreeExecOptions } from './worktree-model'

const PRUNABLE_EXISTENCE_PROBE_CONCURRENCY = 8

export function areWorktreePathsEqual(
  leftPath: string,
  rightPath: string,
  platform = process.platform
): boolean {
  if (platform === 'win32' || looksLikeWindowsPath(leftPath) || looksLikeWindowsPath(rightPath)) {
    return (
      win32.normalize(win32.resolve(leftPath)).toLowerCase() ===
      win32.normalize(win32.resolve(rightPath)).toLowerCase()
    )
  }
  return posix.normalize(posix.resolve(leftPath)) === posix.normalize(posix.resolve(rightPath))
}

function looksLikeWindowsPath(pathValue: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
}

function resolveRevParsePath(repoPath: string, value: string): string {
  if (posix.isAbsolute(value) || win32.isAbsolute(value)) {
    return value
  }
  // Old git ignores `--path-format=absolute`, so a relative toplevel/git-dir
  // must be resolved against the scanned repo path.
  return looksLikeWindowsPath(repoPath)
    ? win32.resolve(repoPath, value)
    : posix.resolve(repoPath, value)
}

type RepoLocation = { topLevel: string; commonDir: string }

function parseRepoLocation(repoPath: string, output: string): RepoLocation | undefined {
  // Old git (pre `--path-format`) echoes the unrecognized flag to stdout and
  // exits 0 rather than erroring, so drop any echoed `-`-prefixed lines and
  // read the two trailing path lines (toplevel, then git-common-dir). Strip only
  // the trailing CR, not surrounding spaces — git paths may legitimately start
  // or end with a space.
  const lines = output
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0 && !line.startsWith('-'))
  if (lines.length < 2) {
    return undefined
  }
  const [topLevel, commonDir] = lines.slice(-2)
  return {
    topLevel: resolveRevParsePath(repoPath, topLevel),
    commonDir: resolveRevParsePath(repoPath, commonDir)
  }
}

async function readRepoLocation(
  repoPath: string,
  resolveBasePath: string,
  options: GitWorktreeExecOptions = {}
): Promise<RepoLocation | undefined> {
  const capabilities = getLocalGitCapabilityCache({
    cwd: repoPath,
    wslDistro: options.wslDistro
  })
  try {
    return await capabilities.runWithFallback(
      'rev-parse-path-format',
      async () => {
        const { stdout } = await gitExecFileAsync(
          ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'],
          gitExecOptions(repoPath, options)
        )
        if (hasUnsupportedRevParsePathFormatEcho(stdout)) {
          // Why: some old Git versions echo the unknown option and exit zero;
          // remember that compatibility signal even though parsing can recover.
          capabilities.rememberUnsupported('rev-parse-path-format')
        }
        return parseRepoLocation(resolveBasePath, stdout)
      },
      async () => {
        const { stdout } = await gitExecFileAsync(
          ['rev-parse', '--show-toplevel', '--git-common-dir'],
          gitExecOptions(repoPath, options)
        )
        return parseRepoLocation(resolveBasePath, stdout)
      },
      isUnsupportedRevParsePathFormatError
    )
  } catch {
    return undefined
  }
}

async function normalizeMainWorktreePath(
  repoPath: string,
  worktrees: GitWorktreeInfo[],
  options: GitWorktreeExecOptions = {}
): Promise<GitWorktreeInfo[]> {
  const mainIndex = worktrees.findIndex((worktree) => worktree.isMainWorktree)
  const mainWorktree = worktrees[mainIndex]
  // Compare in the Git-output space: under WSL the porcelain/rev-parse paths are
  // Linux while repoPath is a UNC path, so without translating, a UNC repoPath
  // never matches the early-return and fires a needless rev-parse on every poll.
  // Use the platform-independent UNC parser so the comparison holds regardless
  // of host OS; the runner still receives the original repoPath for WSL routing.
  const wslRepo = parseWslUncPath(repoPath)
  const comparablePath = wslRepo ? wslRepo.linuxPath : repoPath
  if (!mainWorktree || areWorktreePathsEqual(mainWorktree.path, comparablePath)) {
    return worktrees
  }

  const location = await readRepoLocation(repoPath, comparablePath, options)
  if (!location) {
    return worktrees
  }

  // Why: only a separate-git-dir/submodule main worktree reports the Git
  // directory as the main entry — i.e. the main entry equals git-common-dir.
  // A linked worktree's main entry is a real working root, so gating on this
  // equality avoids overwriting it with the linked worktree's own toplevel.
  if (!areWorktreePathsEqual(mainWorktree.path, location.commonDir)) {
    return worktrees
  }

  const normalized = [...worktrees]
  normalized[mainIndex] = { ...mainWorktree, path: location.topLevel }
  return normalized
}

/**
 * Parse the porcelain output of `git worktree list --porcelain`.
 */
export function parseWorktreeList(
  output: string,
  options: { nulDelimited?: boolean } = {}
): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = []
  const blocks = options.nulDelimited ? splitNulWorktreeList(output) : splitLineWorktreeList(output)

  for (const lines of blocks) {
    if (lines.length === 0) {
      continue
    }

    let path = ''
    let head = ''
    let branch = ''
    let isBare = false
    let isSparse = false
    let locked = false
    let lockReason = ''
    let prunable = false
    let prunableReason = ''

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length)
      } else if (line === 'bare') {
        isBare = true
      } else if (line === 'sparse') {
        isSparse = true
      } else if (line === 'locked' || line.startsWith('locked ')) {
        locked = true
        const rawReason = line.slice('locked'.length).trim()
        lockReason = options.nulDelimited ? rawReason : decodeGitCQuotedPath(rawReason)
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        // Why: Git ≥ 2.36 flags registrations whose directory is gone; ignoring
        // it surfaces the stale worktree as a live workspace (issue #8389).
        prunable = true
        const rawReason = line.slice('prunable'.length).trim()
        prunableReason = options.nulDelimited ? rawReason : decodeGitCQuotedPath(rawReason)
      }
    }

    if (path) {
      // `git worktree list` always emits the main working tree first.
      worktrees.push({
        path,
        head,
        branch,
        isBare,
        ...(isSparse ? { isSparse } : {}),
        ...(locked ? { locked: true } : {}),
        ...(lockReason ? { lockReason } : {}),
        ...(prunable ? { prunable: true } : {}),
        ...(prunableReason ? { prunableReason } : {}),
        isMainWorktree: worktrees.length === 0
      })
    }
  }

  return worktrees
}

function splitLineWorktreeList(output: string): string[][] {
  return output
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim().split(/\r?\n/))
}

function splitNulWorktreeList(output: string): string[][] {
  if (!output.includes('\0')) {
    return splitLineWorktreeList(output)
  }

  const blocks: string[][] = []
  let currentBlock: string[] = []

  for (const field of output.split('\0')) {
    if (field) {
      currentBlock.push(field)
      continue
    }
    if (currentBlock.length > 0) {
      blocks.push(currentBlock)
      currentBlock = []
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock)
  }

  return blocks
}

export async function readWorktreeList(
  repoPath: string,
  options: GitWorktreeExecOptions = {}
): Promise<GitWorktreeInfo[]> {
  const capabilities = getLocalGitCapabilityCache({
    cwd: repoPath,
    wslDistro: options.wslDistro
  })
  return capabilities.runWithFallback(
    'worktree-list-z',
    async () => {
      const { stdout } = await gitExecFileAsync(['worktree', 'list', '--porcelain', '-z'], {
        cwd: repoPath,
        ...options
      })
      return normalizeMainWorktreePath(
        repoPath,
        parseWorktreeList(stdout, { nulDelimited: true }),
        options
      )
    },
    async () => {
      // Why: `-z` is required to preserve worktree paths containing newlines,
      // but Git <2.36 rejects it. Keep the line parser as the fallback.
      const { stdout } = await gitExecFileAsync(['worktree', 'list', '--porcelain'], {
        cwd: repoPath,
        ...options
      })
      const normalized = await normalizeMainWorktreePath(
        repoPath,
        parseWorktreeList(stdout),
        options
      )
      // Why: this `-z`-unsupported fallback (Git <2.36) also serves Git <2.31,
      // which emits no `prunable` annotation; probe each linked worktree path
      // for existence instead of treating stale registrations as live. On Git
      // 2.31–2.35 `parseWorktreeList` already set `prunable`, so the probe is a
      // harmless backstop that skips those entries (issue #8389).
      return annotatePrunableByExistence(normalized, repoPath, options)
    },
    isUnsupportedWorktreeListZError
  )
}

async function annotatePrunableByExistence(
  worktrees: GitWorktreeInfo[],
  repoPath: string,
  options: GitWorktreeExecOptions = {}
): Promise<GitWorktreeInfo[]> {
  const annotated = [...worktrees]
  let nextIndex = 0

  async function probeNext(): Promise<void> {
    while (nextIndex < worktrees.length) {
      const index = nextIndex
      nextIndex += 1
      const worktree = worktrees[index]
      // Git only marks linked worktrees prunable, and never locked ones (a
      // lock shields the registration even when the directory is missing). The
      // `locked` annotation is only parsed on Git >=2.31, so on older Git a
      // locked+missing worktree cannot be shielded here. A missing main
      // worktree is handled by the repo-level ENOENT paths.
      if (
        !worktree ||
        worktree.isMainWorktree ||
        worktree.isBare ||
        worktree.locked ||
        worktree.prunable
      ) {
        continue
      }
      try {
        await stat(translateWorktreePath(worktree.path, repoPath, options))
      } catch (err) {
        if (getErrorCode(err) === 'ENOENT') {
          annotated[index] = { ...worktree, prunable: true }
        }
      }
    }
  }

  const workerCount = Math.min(PRUNABLE_EXISTENCE_PROBE_CONCURRENCY, worktrees.length)
  await Promise.all(Array.from({ length: workerCount }, () => probeNext()))
  return annotated
}

export async function readTranslatedWorktreeGraph(
  repoPath: string,
  options: GitWorktreeExecOptions = {}
): Promise<GitWorktreeInfo[]> {
  return (await readWorktreeList(repoPath, options)).map((worktree) => {
    const translatedPath = translateWorktreePath(worktree.path, repoPath, options)
    return translatedPath === worktree.path ? worktree : { ...worktree, path: translatedPath }
  })
}

export function translateWorktreePath(
  worktreePath: string,
  repoPath: string,
  options: GitWorktreeExecOptions = {}
): string {
  const prefix = 'worktree '
  const translated = translateWslOutputPaths(`${prefix}${worktreePath}`, repoPath, options)
  return translated.startsWith(prefix) ? translated.slice(prefix.length) : worktreePath
}

export async function detectSparseCheckout(worktreePath: string): Promise<boolean> {
  // Why: `listWorktrees` runs on every 3-second git-status poll and on every
  // worktree refresh, so this probe fires N times per poll for N worktrees.
  // The previous `git sparse-checkout list` subprocess made that N*poll extra
  // git processes, which regressed app responsiveness on machines with many
  // worktrees (see PR #1131 revert in #1290). A single fs.stat on the
  // per-worktree sparse-checkout config file is ~two orders of magnitude
  // cheaper and has the same truthiness semantics: Git writes this file when
  // sparse checkout is enabled for the worktree and does not write it
  // otherwise.
  //
  // Why per-worktree gitdir and not `<worktreePath>/.git/info/sparse-checkout`:
  // linked worktrees have a `.git` file that points at
  // `<repo>/.git/worktrees/<name>`, and that is where Git stores the
  // worktree-local sparse-checkout config. `core.sparseCheckout` itself is
  // shared across all worktrees, so the presence of the config file is the
  // correct per-worktree signal.
  try {
    const gitDir = await resolveGitDir(worktreePath)
    const stats = await stat(join(gitDir, 'info', 'sparse-checkout'))
    return stats.isFile() && stats.size > 0
  } catch {
    return false
  }
}
