import type { AppState } from '~renderer/store/types'

import { stableHashString } from './runtime-mobile-editor-tab'
import type { OpenFileByWorktreeAndId } from './runtime-mobile-editor-tab'

export type OpenFileIndexes = {
  byWorktreeAndId: OpenFileByWorktreeAndId
  idsByWorktree: Map<string, string[]>
}

let cachedOpenFileIndexesSource: AppState['openFiles'] | null = null
let cachedOpenFileIndexes: OpenFileIndexes | null = null
let cachedEditorDraftsSource: AppState['editorDrafts'] | null = null
let cachedEditorDraftVersionByFileId: Map<string, string> | null = null

export function getOpenFileIndexes(openFiles: AppState['openFiles']): OpenFileIndexes {
  if (cachedOpenFileIndexesSource === openFiles && cachedOpenFileIndexes) {
    return cachedOpenFileIndexes
  }

  const byWorktreeAndId: OpenFileByWorktreeAndId = new Map()
  const idsByWorktree = new Map<string, string[]>()
  for (const file of openFiles) {
    let filesById = byWorktreeAndId.get(file.worktreeId)
    if (!filesById) {
      filesById = new Map()
      byWorktreeAndId.set(file.worktreeId, filesById)
    }
    let ids = idsByWorktree.get(file.worktreeId)
    if (!ids) {
      ids = []
      idsByWorktree.set(file.worktreeId, ids)
    }
    if (!filesById.has(file.id)) {
      filesById.set(file.id, file)
      ids.push(file.id)
    }
  }

  cachedOpenFileIndexesSource = openFiles
  cachedOpenFileIndexes = { byWorktreeAndId, idsByWorktree }
  return cachedOpenFileIndexes
}

export function getEditorDraftVersionByFileId(
  editorDrafts: AppState['editorDrafts']
): Map<string, string> {
  if (cachedEditorDraftsSource === editorDrafts && cachedEditorDraftVersionByFileId) {
    return cachedEditorDraftVersionByFileId
  }

  const versions = new Map<string, string>()
  for (const [fileId, content] of Object.entries(editorDrafts)) {
    versions.set(fileId, stableHashString(content))
  }
  cachedEditorDraftsSource = editorDrafts
  cachedEditorDraftVersionByFileId = versions
  return versions
}
