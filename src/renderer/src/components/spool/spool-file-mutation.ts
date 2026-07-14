import type { SpoolFileTreeEntry } from '../../../../shared/spool/spool-operation-contract'
import { basename, dirname, joinPath, normalizeRelativePath } from '@/lib/path'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import type { SpoolFileAction } from './SpoolFileActionDialog'
import { parseSpoolMutationResult } from './spool-owner-result-validation'
import { invokeSpoolWorkspaceMutation } from './spool-workspace-operation'

export async function executeSpoolFileAction(
  route: SpoolWorkspaceRoute,
  directory: string,
  action: SpoolFileAction,
  name: string
): Promise<void> {
  let value: unknown
  if (action.kind === 'new-file') {
    value = await invokeSpoolWorkspaceMutation(route, 'files.write', {
      relativePath: joinSpoolRelativePath(directory, name),
      content: '',
      encoding: 'utf8',
      mode: 'create'
    })
  } else if (action.kind === 'new-directory') {
    value = await invokeSpoolWorkspaceMutation(route, 'files.mkdir', {
      relativePath: joinSpoolRelativePath(directory, name)
    })
  } else if (action.kind === 'rename') {
    value = await invokeSpoolWorkspaceMutation(route, 'files.rename', {
      relativePath: action.entry.relativePath,
      destinationRelativePath: joinSpoolRelativePath(
        parentSpoolRelativePath(action.entry.relativePath),
        name
      )
    })
  } else {
    value = await invokeSpoolWorkspaceMutation(route, 'files.delete', {
      relativePath: action.entry.relativePath,
      recursive: action.entry.kind === 'directory'
    })
  }
  parseSpoolMutationResult(value)
}

export function parentSpoolRelativePath(relativePath: string): string {
  if (!relativePath) {
    return ''
  }
  const parent = dirname(normalizeRelativePath(relativePath))
  return parent === '.' ? '' : normalizeRelativePath(parent)
}

export function joinSpoolRelativePath(parent: string, name: string): string {
  return normalizeRelativePath(joinPath(parent, name))
}

export function isValidSpoolEntryName(name: string): boolean {
  return (
    name !== '.' && name !== '..' && basename(name) === name && normalizeRelativePath(name) === name
  )
}

export function nextSelectedSpoolFileEntry(
  action: SpoolFileAction,
  selectedEntry: SpoolFileTreeEntry | null,
  destinationPath: string,
  name: string
): SpoolFileTreeEntry | null {
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
