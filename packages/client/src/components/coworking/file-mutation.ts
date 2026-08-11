import { basename, dirname, joinPath, normalizeRelativePath } from '~renderer/lib/path'
import type { CoworkingFileTreeEntry } from '~shared/coworking/operation-contract'

import type { CoworkingFileAction } from './file-action-dialog'
import { parseCoworkingMutationResult } from './owner-result-validation'
import { invokeCoworkingWorkspaceMutation } from './workspace-operation'
import type { CoworkingWorktreeRoute } from './worktree-route'

export async function executeCoworkingFileAction(
  route: CoworkingWorktreeRoute,
  directory: string,
  action: CoworkingFileAction,
  name: string
): Promise<void> {
  let value: unknown
  if (action.kind === 'new-file') {
    value = await invokeCoworkingWorkspaceMutation(route, 'files.write', {
      relativePath: joinCoworkingRelativePath(directory, name),
      content: '',
      encoding: 'utf8',
      mode: 'create'
    })
  } else if (action.kind === 'new-directory') {
    value = await invokeCoworkingWorkspaceMutation(route, 'files.mkdir', {
      relativePath: joinCoworkingRelativePath(directory, name)
    })
  } else if (action.kind === 'rename') {
    value = await invokeCoworkingWorkspaceMutation(route, 'files.rename', {
      relativePath: action.entry.relativePath,
      destinationRelativePath: joinCoworkingRelativePath(
        parentCoworkingRelativePath(action.entry.relativePath),
        name
      )
    })
  } else {
    value = await invokeCoworkingWorkspaceMutation(route, 'files.delete', {
      relativePath: action.entry.relativePath,
      recursive: action.entry.kind === 'directory'
    })
  }
  parseCoworkingMutationResult(value)
}

export function parentCoworkingRelativePath(relativePath: string): string {
  if (!relativePath) {
    return ''
  }
  const parent = dirname(normalizeRelativePath(relativePath))
  return parent === '.' ? '' : normalizeRelativePath(parent)
}

export function joinCoworkingRelativePath(parent: string, name: string): string {
  return normalizeRelativePath(joinPath(parent, name))
}

export function isValidCoworkingEntryName(name: string): boolean {
  return (
    name !== '.' && name !== '..' && basename(name) === name && normalizeRelativePath(name) === name
  )
}

export function nextSelectedCoworkingFileEntry(
  action: CoworkingFileAction,
  selectedEntry: CoworkingFileTreeEntry | null,
  destinationPath: string,
  name: string
): CoworkingFileTreeEntry | null {
  if (action.kind === 'new-file') {
    return { relativePath: destinationPath, name, kind: 'file', size: 0, modifiedAt: null }
  }
  if (
    action.kind === 'rename' &&
    selectedEntry?.relativePath === action.entry.relativePath &&
    selectedEntry.kind !== 'directory'
  ) {
    return { ...selectedEntry, relativePath: destinationPath, name }
  }
  return null
}
