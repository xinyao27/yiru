import { realpath, stat } from 'node:fs/promises'
import { getSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { getActiveSshHostPlatform } from './ipc/ssh'
import { getLocalExecutionHostLabel, parseExecutionHostId } from '../shared/execution-host'
import { normalizeRuntimePathForComparison } from '../shared/cross-platform-path'
import { parseWslUncPath } from '../shared/wsl-paths'
import { splitWorktreeIdForFilesystem } from '../shared/worktree-id'
import type {
  LanguageServerDocumentUriResult,
  LanguageServerLocationResult,
  LanguageServerSettings
} from '../shared/language-server'
import {
  authorizedLanguageServerRelativePath,
  languageServerDisplayPath,
  languageServerFilePath,
  languageServerFileUri,
  type LanguageServerPathFlavor
} from './language-server-host-path'
import { inspectWslLanguageServerPath } from './wsl-language-server-filesystem'
import type { IFilesystemProvider } from './providers/types'

export type LanguageServerStore = {
  getSettings: () => { languageServer?: LanguageServerSettings }
  getRepos: () => {
    id: string
    path: string
    connectionId?: string | null
    executionHostId?: string | null
  }[]
  getWorktreeMeta: (worktreeId: string) => unknown
}

export type LanguageServerWorkspaceHost =
  | { kind: 'local'; id: 'local'; label: string; pathFlavor: LanguageServerPathFlavor }
  | {
      kind: 'wsl'
      id: `wsl:${string}`
      label: string
      pathFlavor: 'posix'
      distro: string
    }
  | {
      kind: 'ssh'
      id: `ssh:${string}`
      label: string
      pathFlavor: LanguageServerPathFlavor
      connectionId: string
    }

export type LanguageServerWorkspace = {
  path: string
  displayPath: string
  uri: string
  host: LanguageServerWorkspaceHost
  inspectPath: (hostPath: string) => Promise<{ path: string; type: 'file' | 'directory' | 'other' }>
  toHostPath: (displayPath: string) => string
  displayUsesWslUnc: boolean
}

export async function resolveLanguageServerWorkspace(
  store: LanguageServerStore,
  worktreeId: string
): Promise<LanguageServerWorkspace> {
  if (typeof worktreeId !== 'string') {
    throw new Error('Language server requires a valid workspace.')
  }
  const parsed = splitWorktreeIdForFilesystem(worktreeId)
  if (!parsed) {
    throw new Error('Language server requires a valid workspace.')
  }
  const repo = store.getRepos().find((candidate) => candidate.id === parsed.repoId)
  if (!repo) {
    throw new Error('Language server workspace is not registered with Yiru.')
  }
  assertRegisteredCheckout(store, repo.path, parsed.repoId, worktreeId, parsed.worktreePath)

  const executionHost = parseExecutionHostId(repo.executionHostId)
  if (executionHost?.kind === 'runtime') {
    throw new Error('Runtime-owned language servers must start through their runtime connection.')
  }
  const explicitSshTarget = executionHost?.kind === 'ssh' ? executionHost.targetId : null
  const connectionId = repo.connectionId?.trim() || explicitSshTarget
  if (repo.connectionId && explicitSshTarget && repo.connectionId !== explicitSshTarget) {
    throw new Error('Language server workspace has conflicting execution hosts.')
  }
  if (connectionId) {
    return resolveSshWorkspace(connectionId, parsed.worktreePath)
  }
  const wsl = parseWslUncPath(parsed.worktreePath)
  if (wsl) {
    return resolveWslWorkspace(wsl.distro, wsl.linuxPath, parsed.worktreePath)
  }
  return resolveNativeWorkspace(parsed.worktreePath)
}

export async function resolveLanguageServerDocumentUri(
  workspace: LanguageServerWorkspace,
  filePath: string
): Promise<LanguageServerDocumentUriResult> {
  if (typeof filePath !== 'string') {
    throw new Error('Language server requires a valid file path.')
  }
  const inspected = await workspace.inspectPath(workspace.toHostPath(filePath))
  assertAuthorizedFile(workspace, inspected)
  return { uri: languageServerFileUri(inspected.path, workspace.host.pathFlavor) }
}

export async function resolveLanguageServerLocation(
  workspace: LanguageServerWorkspace,
  uri: string
): Promise<LanguageServerLocationResult> {
  const hostPath = languageServerFilePath(uri, workspace.host.pathFlavor)
  const inspected = await workspace.inspectPath(hostPath)
  const relativePath = assertAuthorizedFile(workspace, inspected)
  return {
    filePath: languageServerDisplayPath(
      workspace.displayPath,
      relativePath,
      workspace.host.pathFlavor,
      workspace.displayUsesWslUnc
    ),
    relativePath
  }
}

async function resolveNativeWorkspace(displayPath: string): Promise<LanguageServerWorkspace> {
  const inspectPath = inspectNativePath
  const inspected = await inspectPath(displayPath)
  assertWorkspaceDirectory(inspected)
  const pathFlavor: LanguageServerPathFlavor = process.platform === 'win32' ? 'windows' : 'posix'
  return {
    path: inspected.path,
    displayPath,
    uri: languageServerFileUri(inspected.path, pathFlavor),
    host: {
      kind: 'local',
      id: 'local',
      label: getLocalExecutionHostLabel(process.platform),
      pathFlavor
    },
    inspectPath,
    toHostPath: (filePath) => filePath,
    displayUsesWslUnc: false
  }
}

async function resolveWslWorkspace(
  distro: string,
  linuxPath: string,
  displayPath: string
): Promise<LanguageServerWorkspace> {
  const inspectPath = (candidate: string) => inspectWslLanguageServerPath(distro, candidate)
  const inspected = await inspectPath(linuxPath)
  assertWorkspaceDirectory(inspected)
  return {
    path: inspected.path,
    displayPath,
    uri: languageServerFileUri(inspected.path, 'posix'),
    host: {
      kind: 'wsl',
      id: `wsl:${distro}`,
      label: `WSL: ${distro}`,
      pathFlavor: 'posix',
      distro
    },
    inspectPath,
    toHostPath: (filePath) => {
      const parsed = parseWslUncPath(filePath)
      if (!parsed || parsed.distro.toLowerCase() !== distro.toLowerCase()) {
        throw new Error('Language server file belongs to a different WSL distribution.')
      }
      return parsed.linuxPath
    },
    displayUsesWslUnc: true
  }
}

async function resolveSshWorkspace(
  connectionId: string,
  displayPath: string
): Promise<LanguageServerWorkspace> {
  const provider = getSshFilesystemProvider(connectionId)
  const platform = getActiveSshHostPlatform(connectionId)
  if (!provider || !platform) {
    throw new Error('Connect the owning SSH host before starting its language server.')
  }
  const inspectPath = (candidate: string) => inspectRemotePath(provider, candidate)
  const inspected = await inspectPath(displayPath)
  assertWorkspaceDirectory(inspected)
  return {
    path: inspected.path,
    displayPath,
    uri: languageServerFileUri(inspected.path, platform.pathFlavor),
    host: {
      kind: 'ssh',
      id: `ssh:${connectionId}`,
      label: `SSH: ${connectionId}`,
      pathFlavor: platform.pathFlavor,
      connectionId
    },
    inspectPath,
    toHostPath: (filePath) => filePath,
    displayUsesWslUnc: false
  }
}

async function inspectNativePath(
  candidate: string
): Promise<{ path: string; type: 'file' | 'directory' | 'other' }> {
  const canonicalPath = await realpath(candidate)
  const metadata = await stat(canonicalPath)
  return {
    path: canonicalPath,
    type: metadata.isFile() ? 'file' : metadata.isDirectory() ? 'directory' : 'other'
  }
}

async function inspectRemotePath(
  provider: IFilesystemProvider,
  candidate: string
): Promise<{ path: string; type: 'file' | 'directory' | 'other' }> {
  const canonicalPath = await provider.realpath(candidate)
  const metadata = await provider.stat(canonicalPath)
  return {
    path: canonicalPath,
    type: metadata.type === 'file' || metadata.type === 'directory' ? metadata.type : 'other'
  }
}

function assertWorkspaceDirectory(inspected: { type: string }): void {
  if (inspected.type !== 'directory') {
    throw new Error('Language server workspace is not a directory.')
  }
}

function assertAuthorizedFile(
  workspace: LanguageServerWorkspace,
  inspected: { path: string; type: string }
): string {
  const relativePath = authorizedLanguageServerRelativePath(workspace.path, inspected.path)
  if (inspected.type !== 'file') {
    throw new Error('Language server document is not a regular file.')
  }
  return relativePath
}

function assertRegisteredCheckout(
  store: LanguageServerStore,
  repoPath: string,
  repoId: string,
  worktreeId: string,
  worktreePath: string
): void {
  const isPrimary =
    normalizeRuntimePathForComparison(worktreePath) === normalizeRuntimePathForComparison(repoPath)
  if (!isPrimary && !store.getWorktreeMeta(worktreeId)) {
    // Why: worktree IDs contain a path; require authoritative metadata before
    // turning that renderer-supplied path into a process working directory.
    throw new Error(`Language server worktree is not registered for repo ${repoId}.`)
  }
}
