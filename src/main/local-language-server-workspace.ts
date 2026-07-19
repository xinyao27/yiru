import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Store } from './persistence'
import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison
} from '../shared/cross-platform-path'
import { splitWorktreeIdForFilesystem } from '../shared/worktree-id'
import type {
  LanguageServerDocumentUriResult,
  LanguageServerLocationResult
} from '../shared/language-server'

export type LocalLanguageServerWorkspace = {
  path: string
  displayPath: string
  uri: string
}

export async function resolveLocalLanguageServerWorkspace(
  store: Store,
  worktreeId: string
): Promise<LocalLanguageServerWorkspace> {
  if (typeof worktreeId !== 'string') {
    throw new Error('Language server requires a valid local workspace.')
  }
  const parsed = splitWorktreeIdForFilesystem(worktreeId)
  if (!parsed) {
    throw new Error('Language server requires a valid local workspace.')
  }
  const repo = store.getRepos().find((candidate) => candidate.id === parsed.repoId)
  if (!repo || repo.connectionId || (repo.executionHostId && repo.executionHostId !== 'local')) {
    throw new Error('Language servers currently support local workspaces only.')
  }
  const isPrimaryCheckout =
    normalizeRuntimePathForComparison(parsed.worktreePath) ===
    normalizeRuntimePathForComparison(repo.path)
  if (!isPrimaryCheckout && !store.getWorktreeMeta(worktreeId)) {
    // Why: worktree IDs contain a path, so require authoritative metadata before
    // allowing the renderer to turn that path into a process cwd.
    throw new Error('Language server workspace is not registered with Yiru.')
  }

  const canonicalPath = await realpath(parsed.worktreePath)
  const workspaceStat = await stat(canonicalPath)
  if (!workspaceStat.isDirectory()) {
    throw new Error('Language server workspace is not a directory.')
  }
  return {
    path: canonicalPath,
    displayPath: parsed.worktreePath,
    uri: pathToFileURL(canonicalPath).toString()
  }
}

export async function resolveLanguageServerDocumentUri(
  workspace: LocalLanguageServerWorkspace,
  filePath: string
): Promise<LanguageServerDocumentUriResult> {
  const canonicalPath = await resolveAuthorizedFile(workspace, filePath)
  return { uri: pathToFileURL(canonicalPath).toString() }
}

export async function resolveLanguageServerLocation(
  workspace: LocalLanguageServerWorkspace,
  uri: string
): Promise<LanguageServerLocationResult> {
  let filePath: string
  try {
    const parsed = new URL(uri)
    if (parsed.protocol !== 'file:') {
      throw new Error('unsupported scheme')
    }
    filePath = fileURLToPath(parsed)
  } catch {
    throw new Error('Language server returned an unsupported document URI.')
  }
  const canonicalPath = await resolveAuthorizedFile(workspace, filePath)
  const relativePath = path.relative(workspace.path, canonicalPath)
  return {
    // Why: authorization uses canonical paths, but editor identity keeps the
    // managed workspace spelling so `/tmp` and macOS `/private/tmp` do not
    // become duplicate tabs for the same definition.
    filePath: path.join(workspace.displayPath, relativePath),
    relativePath
  }
}

async function resolveAuthorizedFile(
  workspace: LocalLanguageServerWorkspace,
  filePath: string
): Promise<string> {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('Language server requires an absolute local file path.')
  }
  const canonicalPath = await realpath(filePath)
  if (!isPathInsideOrEqual(workspace.path, canonicalPath)) {
    throw new Error('Language server document is outside the owning workspace.')
  }
  const fileStat = await stat(canonicalPath)
  if (!fileStat.isFile()) {
    throw new Error('Language server document is not a regular file.')
  }
  return canonicalPath
}
