import type { DirEntry } from '../../../../shared/types'
import {
  isWindowsAbsolutePathLike,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../../../../shared/cross-platform-path'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree-id'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { basename, dirname, joinPath } from '@/lib/path'
import {
  readRuntimeDirectory,
  statRuntimePath,
  type RuntimeFileOperationArgs
} from '@/runtime/runtime-file-client'
import { settingsForRuntimeOwner } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import type { EditorNavigationTarget } from './open-editor-navigation-target'
import { isRelativeModuleSpecifier } from './import-module-specifier'

const MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.d.ts',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.vue',
  '.svelte',
  '.astro'
] as const

export type RelativeImportContext = {
  filePath: string
  worktreeId: string
  runtimeEnvironmentId?: string | null
}

export async function resolveRelativeImportTarget(
  context: RelativeImportContext,
  moduleSpecifier: string
): Promise<EditorNavigationTarget | null> {
  if (!isRelativeModuleSpecifier(moduleSpecifier)) {
    return null
  }
  const worktreePath = splitWorktreeIdForFilesystem(context.worktreeId)?.worktreePath
  if (!worktreePath) {
    return null
  }
  const cleanSpecifier = moduleSpecifier.replace(/[?#][\s\S]*$/, '')
  const unresolvedPath = resolveRuntimePath(dirname(context.filePath), cleanSpecifier)
  // Why: modifier-click must not turn source text into an arbitrary host-file
  // opener, especially when the editor belongs to SSH or a remote runtime.
  if (relativePathInsideRoot(worktreePath, unresolvedPath) === null) {
    return null
  }

  const state = useAppStore.getState()
  const connectionId = getConnectionIdForFileFromState(state, context.worktreeId, context.filePath)
  const fileContext: RuntimeFileOperationArgs = {
    settings: settingsForRuntimeOwner(state.settings, context.runtimeEnvironmentId),
    worktreeId: context.worktreeId,
    worktreePath,
    connectionId: connectionId ?? undefined
  }
  const parentPath = dirname(unresolvedPath)
  const moduleName = basename(unresolvedPath)
  const entries = await readRuntimeDirectory(fileContext, parentPath).catch(() => [])
  const exact = findEntry(entries, moduleName, parentPath)
  if (exact) {
    const exactPath = joinPath(parentPath, exact.name)
    const exactTarget = await resolveExactEntry(fileContext, worktreePath, exactPath, exact)
    if (exactTarget) {
      return exactTarget
    }
  }

  if (!hasFileExtension(moduleName)) {
    for (const extension of MODULE_EXTENSIONS) {
      const candidate = findEntry(entries, `${moduleName}${extension}`, parentPath)
      if (candidate && !candidate.isDirectory) {
        return toNavigationTarget(worktreePath, joinPath(parentPath, candidate.name))
      }
    }
  }
  return null
}

async function resolveExactEntry(
  fileContext: RuntimeFileOperationArgs,
  worktreePath: string,
  exactPath: string,
  entry: DirEntry
): Promise<EditorNavigationTarget | null> {
  let isDirectory = entry.isDirectory
  if (entry.isSymlink) {
    const stat = await statRuntimePath(fileContext, exactPath).catch(() => null)
    if (!stat) {
      return null
    }
    isDirectory = stat.isDirectory
  }
  if (!isDirectory) {
    return toNavigationTarget(worktreePath, exactPath)
  }
  const children = await readRuntimeDirectory(fileContext, exactPath).catch(() => [])
  for (const extension of MODULE_EXTENSIONS) {
    const index = findEntry(children, `index${extension}`, exactPath)
    if (index && !index.isDirectory) {
      return toNavigationTarget(worktreePath, joinPath(exactPath, index.name))
    }
  }
  return null
}

function toNavigationTarget(worktreePath: string, filePath: string): EditorNavigationTarget | null {
  const relativePath = relativePathInsideRoot(worktreePath, filePath)
  return relativePath === null ? null : { filePath, relativePath, line: 1, column: 1 }
}

function findEntry(entries: DirEntry[], name: string, parentPath: string): DirEntry | null {
  const caseInsensitive = isWindowsAbsolutePathLike(parentPath)
  return (
    entries.find((entry) =>
      caseInsensitive ? entry.name.toLowerCase() === name.toLowerCase() : entry.name === name
    ) ?? null
  )
}

function hasFileExtension(name: string): boolean {
  return /(?:^|.)\.[^./\\]+$/.test(name)
}
