import type { DiffSource, EditorOpenTargetOptions, OpenFile } from './file-model'
import type { EditorSlice } from './store-contract'

export function runtimeOwnerKey(runtimeEnvironmentId: string | null | undefined): string | null {
  return runtimeEnvironmentId?.trim() || null
}

export function isSameEditorOwner(
  file: Pick<OpenFile, 'worktreeId' | 'runtimeEnvironmentId'>,
  worktreeId: string,
  runtimeEnvironmentId: string | null | undefined
): boolean {
  return (
    file.worktreeId === worktreeId &&
    runtimeOwnerKey(file.runtimeEnvironmentId) === runtimeOwnerKey(runtimeEnvironmentId)
  )
}

export function buildOwnedEditorFileId(
  filePath: string,
  worktreeId: string,
  runtimeEnvironmentId: string | null | undefined
): string {
  const runtimeKey = runtimeOwnerKey(runtimeEnvironmentId) ?? 'local'
  return `editor:${encodeURIComponent(worktreeId)}:${encodeURIComponent(runtimeKey)}:${encodeURIComponent(filePath)}`
}

export function buildDiffEditorFileId(
  worktreeId: string,
  diffSource: DiffSource,
  relativePath: string,
  runtimeEnvironmentId: string | null | undefined
): string {
  const legacyId = `${worktreeId}::diff::${diffSource}::${relativePath}`
  const runtimeKey = runtimeOwnerKey(runtimeEnvironmentId)
  return runtimeKey
    ? `editor-diff:${encodeURIComponent(worktreeId)}:${encodeURIComponent(runtimeKey)}:${encodeURIComponent(diffSource)}:${encodeURIComponent(relativePath)}`
    : legacyId
}

export function withDiffContentReloadRequest(file: OpenFile): OpenFile {
  return {
    ...file,
    diffContentReloadNonce: (file.diffContentReloadNonce ?? 0) + 1
  }
}

export function shouldRequestExistingFileContentReload(
  existing: OpenFile,
  nextMode: OpenFile['mode'],
  options: EditorOpenTargetOptions | undefined
): boolean {
  return (
    options?.forceContentReload === true &&
    !existing.isDirty &&
    (existing.mode === 'edit' || existing.mode === 'markdown-preview') &&
    (nextMode === 'edit' || nextMode === 'markdown-preview')
  )
}

export function isEditorFileIdOccupiedByOtherOwner(
  file: Pick<
    OpenFile,
    'id' | 'worktreeId' | 'runtimeEnvironmentId' | 'markdownPreviewSourceFileId'
  >,
  filePath: string,
  worktreeId: string,
  runtimeEnvironmentId: string | null | undefined
): boolean {
  if (isSameEditorOwner(file, worktreeId, runtimeEnvironmentId)) {
    return false
  }
  return file.id === filePath || file.markdownPreviewSourceFileId === filePath
}

export function matchesEditorMode(
  file: OpenFile,
  modes: readonly OpenFile['mode'][] | undefined
): boolean {
  return !modes || modes.includes(file.mode)
}

export function getReusableOpenFileModes(mode: OpenFile['mode']): readonly OpenFile['mode'][] {
  // Why: the same path can be open as both a diff and an editable file; matching
  // by path alone collapses those distinct visible tabs onto one OpenFile.
  return [mode]
}

export function resolveEditorFileIdForOwner(
  state: Pick<EditorSlice, 'openFiles'>,
  filePath: string,
  worktreeId: string,
  runtimeEnvironmentId: string | null | undefined,
  modes?: readonly OpenFile['mode'][]
): string {
  const existing = state.openFiles.find(
    (file) =>
      file.filePath === filePath &&
      matchesEditorMode(file, modes) &&
      isSameEditorOwner(file, worktreeId, runtimeEnvironmentId)
  )
  if (existing) {
    return existing.id
  }
  // Why: preview-only markdown tabs also reserve their source id. Treat those
  // source ids like open editor ids so same-path owners do not collapse.
  return state.openFiles.some((file) =>
    isEditorFileIdOccupiedByOtherOwner(file, filePath, worktreeId, runtimeEnvironmentId)
  )
    ? buildOwnedEditorFileId(filePath, worktreeId, runtimeEnvironmentId)
    : filePath
}

export function getOpenedEditFileIdAfterOpen(
  state: Pick<EditorSlice, 'openFiles' | 'activeFileIdByWorktree'>,
  filePath: string,
  worktreeId: string
): string {
  const activeFileId = state.activeFileIdByWorktree[worktreeId]
  const activeFile = state.openFiles.find(
    (file) =>
      file.id === activeFileId &&
      file.filePath === filePath &&
      file.worktreeId === worktreeId &&
      file.mode === 'edit'
  )
  if (activeFile) {
    return activeFile.id
  }
  return (
    state.openFiles.find(
      (file) => file.filePath === filePath && file.worktreeId === worktreeId && file.mode === 'edit'
    )?.id ?? filePath
  )
}
