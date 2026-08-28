import { existsSync, statSync } from 'node:fs'

import {
  normalizeRuntimePathSeparators,
  parseWslUncPath
} from '@yiru/runtime-protocol/model/platform'

import { toWindowsWslPath } from '../../platform/wsl'
import { gitExecFileSync } from '../runner/runner'
import { scanGitMarkerSync } from './repo-marker'

type GitRepoProbeResult = 'repo' | 'not-repo' | 'indeterminate'

export function isGitRepo(path: string): boolean {
  try {
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      return false
    }
  } catch {
    return false
  }

  // Authoritative positive signal: ask git directly. Covers regular work
  // trees, linked worktrees (gitfile), submodules, and bare repos.
  const gitProbeResult = probeGitRepo(path)
  if (gitProbeResult === 'repo') {
    return true
  }
  if (gitProbeResult === 'not-repo') {
    return false
  }

  // Why: `git rev-parse` can fail to produce a clean answer for reasons
  // unrelated to repo-ness — a transient spawn failure or git-shim hiccup in
  // the packaged app, resource pressure in the Electron main process, or a
  // repo whose config errors out. Treating every such failure as "not a repo"
  // silently downgrades a real repository to a plain folder (worktrees, SCM,
  // PRs all disappear) and is the regression behind the spurious "Open as
  // Folder" prompt. Fall back to a validated `.git` marker so a directory that
  // genuinely carries Git metadata is still recognized; a directory with only
  // a garbage `.git` file has no valid marker and is correctly rejected.
  const markerScan = scanGitMarkerSync(path)
  if (markerScan.status === 'valid' && !warnedMarkerFallbackThisSession) {
    // Why: warn only once per session. The folder scanner calls isGitRepo for
    // many paths; if git is genuinely unavailable, warning per path would flood
    // the main-process logs without adding signal beyond the first occurrence.
    warnedMarkerFallbackThisSession = true
    console.warn('[isGitRepo] git rev-parse could not confirm repo; accepted via .git marker', {
      path
    })
  }
  return markerScan.status === 'valid'
}

let warnedMarkerFallbackThisSession = false

/**
 * Tri-state git probe: only a clean pair of negative answers is a definitive
 * non-repo. Spawn/config failures stay indeterminate so marker fallback can run.
 */
function probeGitRepo(path: string): GitRepoProbeResult {
  let sawFailure = false

  try {
    const insideWorkTree = gitExecFileSync(['rev-parse', '--is-inside-work-tree'], {
      cwd: path
    }).trim()
    if (insideWorkTree === 'true') {
      return 'repo'
    }
    if (insideWorkTree !== 'false') {
      return 'indeterminate'
    }
  } catch {
    sawFailure = true
  }

  try {
    const bareRepo = gitExecFileSync(['rev-parse', '--is-bare-repository'], {
      cwd: path
    }).trim()
    if (bareRepo === 'true') {
      return 'repo'
    }
    if (bareRepo !== 'false') {
      return 'indeterminate'
    }
  } catch {
    sawFailure = true
  }

  return sawFailure ? 'indeterminate' : 'not-repo'
}

export function getGitRepoRoot(path: string): string {
  try {
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      return path
    }
    const insideWorkTree = gitExecFileSync(['rev-parse', '--is-inside-work-tree'], {
      cwd: path
    }).trim()
    if (insideWorkTree === 'true') {
      const root = gitExecFileSync(['rev-parse', '--show-toplevel'], {
        cwd: path
      }).trim()
      return normalizeGitRepoRootForInputPath(path, root)
    }
  } catch {
    // Fall through to preserving the original path.
  }
  const markerScan = scanGitMarkerSync(path)
  if (markerScan.status === 'valid') {
    return normalizeGitRepoRootForInputPath(path, markerScan.rootPath)
  }
  return path
}

export function normalizeGitRepoRootForInputPath(inputPath: string, rootPath: string): string {
  const inputWsl = parseWslUncPath(inputPath)
  if (inputWsl && rootPath.startsWith('/')) {
    // Why: WSL git reports Linux-native roots; Yiru must persist the UNC path so
    // later local git calls keep routing through the WSL-aware runner.
    return toWindowsWslPath(rootPath, inputWsl.distro)
  }
  return normalizeRuntimePathSeparators(rootPath)
}

/**
 * Filesystem-only check for genuine Git metadata, used as a fallback when git
 * cannot give a clean answer. Strict enough to reject a directory whose `.git`
 * is a garbage file (preserving the validation added in 18ed7b27d):
 * - `.git` directory: accepted only if it has real common or linked-worktree
 *   gitdir shape, so empty/incomplete `.git/` folders are rejected.
 * - `.git` file: accepted only if its `gitdir:` target resolves to valid Git
 *   metadata, covering linked worktrees and submodules.
 * - bare repo root: accepted when HEAD + objects/ + refs/ are present and the
 *   config does not mark it as a regular worktree admin dir.
 */
