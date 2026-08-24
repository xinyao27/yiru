import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { isPathInsideOrEqual, isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'

import { parseWslPath, toWindowsWslPath } from '../wsl'

export function normalizeTerminalFileUriAuthorityPath(
  pathText: string,
  worktreePath?: string
): string {
  if (!pathText.startsWith('//')) {
    return pathText
  }
  const match = /^\/\/([^/\\]+)([/\\].*)$/.exec(pathText)
  if (!match) {
    return pathText
  }
  const host = match[1]!.toLowerCase()
  if (isLoopbackFileUriHostname(host) && process.platform !== 'win32') {
    return normalizeLeadingSlashDrivePath(match[2]!, worktreePath)
  }
  // Why: a file URI authority names a host. Without a verified host match,
  // stripping it could open a same-path artifact on the wrong runtime host.
  return pathText
}

export function provenancePathCandidate(pathText: string, absolutePath: string): string {
  return pathText.startsWith('//') ? pathText : absolutePath
}

export function isLoopbackFileUriHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function normalizeLeadingSlashDrivePath(pathText: string, worktreePath?: string): string {
  return worktreePath &&
    isWindowsAbsolutePathLike(worktreePath) &&
    /^\/[A-Za-z]:[\\/]/.test(pathText)
    ? pathText.slice(1)
    : pathText
}

export async function resolveAllowedLocalTerminalArtifactPath(
  absolutePath: string,
  worktreePath: string
): Promise<string | null> {
  const roots = await localTerminalArtifactRoots(worktreePath)
  const canonicalPath = await canonicalPathForArtifactComparison(absolutePath)
  return roots.some((root) => isPathInsideOrEqual(root, canonicalPath)) ? canonicalPath : null
}

export async function localTerminalArtifactRoots(worktreePath: string): Promise<string[]> {
  const roots = new Set<string>([tmpdir()])
  if (process.platform !== 'win32') {
    roots.add('/tmp')
    roots.add('/private/tmp')
  }
  const wsl = parseWslPath(worktreePath)
  if (wsl) {
    roots.add(toWindowsWslPath('/tmp', wsl.distro))
  }
  const canonicalRoots = await Promise.all(
    Array.from(roots).map((root) => canonicalPathForArtifactComparison(root))
  )
  return Array.from(new Set([...roots, ...canonicalRoots]))
}

export async function canonicalPathForArtifactComparison(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return path
  }
}
