import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { OpenFile } from '~renderer/editor/state'
import type { useAppStore } from '~renderer/store/state'

import type { DiffContent, FileContent } from './panel-content-types'
import {
  isReloadableSingleFileDiffTab,
  shouldReloadDiffOnGitStatusChange
} from './panel-diff-reload'

type GitStatusByWorktree = ReturnType<typeof useAppStore.getState>['gitStatusByWorktree']
type LoadDiffContent = (file: OpenFile | null, options?: { force?: boolean }) => Promise<void>
type LoadFileContent = (
  filePath: string,
  id: string,
  worktreeId?: string,
  relativePath?: string,
  options?: { force?: boolean }
) => Promise<void>

type EditorPanelContentReloadParams = {
  activeFile: OpenFile | null
  diffContentsRef: MutableRefObject<Record<string, DiffContent>>
  gitStatusEntries: GitStatusByWorktree[string] | undefined
  isChangesMode: boolean
  loadDiffContent: LoadDiffContent
  loadFileContent: LoadFileContent
  openFilesRef: MutableRefObject<OpenFile[]>
  setDiffContents: Dispatch<SetStateAction<Record<string, DiffContent>>>
  setFileContents: Dispatch<SetStateAction<Record<string, FileContent>>>
}

export function useEditorPanelContentReload({
  activeFile,
  diffContentsRef,
  gitStatusEntries,
  isChangesMode,
  loadDiffContent,
  loadFileContent,
  openFilesRef,
  setDiffContents,
  setFileContents
}: EditorPanelContentReloadParams): void {
  const changesStatusEntries = activeFile?.worktreeId ? gitStatusEntries : undefined
  const activeFileGitStatusEntries = (() => {
    if (!activeFile?.relativePath || !changesStatusEntries) {
      return undefined
    }
    return changesStatusEntries.filter((entry) => entry.path === activeFile.relativePath)
  })()
  const activeFileGitStatusSignature = (() => {
    if (!activeFileGitStatusEntries) {
      return ''
    }
    return JSON.stringify(
      activeFileGitStatusEntries.map((entry) => ({
        area: entry.area,
        status: entry.status,
        conflictStatus: entry.conflictStatus
      }))
    )
  })()
  const activeFileShouldReloadOnGitStatusChange = (() =>
    activeFile
      ? shouldReloadDiffOnGitStatusChange(activeFile, activeFileGitStatusEntries)
      : false)()

  useEffect(() => {
    if (!activeFile?.id) {
      return
    }
    const current = openFilesRef.current.find((file) => file.id === activeFile.id)
    if (!current || !(isChangesMode || activeFileShouldReloadOnGitStatusChange)) {
      return
    }
    // Why: the lazy-load effect already fetches on first open; forcing here
    // would race a duplicate git-diff RPC for the same tab.
    if (!diffContentsRef.current[current.id]) {
      return
    }
    void loadDiffContent(current, { force: true })
  }, [
    activeFileShouldReloadOnGitStatusChange,
    activeFileGitStatusSignature,
    isChangesMode,
    activeFile?.id,
    diffContentsRef,
    loadDiffContent,
    openFilesRef
  ])

  useEffect(() => {
    const nonce = activeFile?.diffContentReloadNonce
    if (!activeFile?.id || nonce === undefined || nonce === 0) {
      return
    }
    const current = openFilesRef.current.find((file) => file.id === activeFile.id)
    if (!current || !isReloadableSingleFileDiffTab(current)) {
      return
    }
    setDiffContents((previous) => {
      if (!previous[current.id]) {
        return previous
      }
      const next = { ...previous }
      delete next[current.id]
      return next
    })
    void loadDiffContent(current, { force: true })
  }, [
    activeFile?.diffContentReloadNonce,
    activeFile?.id,
    loadDiffContent,
    openFilesRef,
    setDiffContents
  ])

  useEffect(() => {
    const nonce = activeFile?.fileContentReloadNonce
    if (!activeFile?.id || nonce === undefined || nonce === 0) {
      return
    }
    const current = openFilesRef.current.find((file) => file.id === activeFile.id)
    if (
      !current ||
      current.isDirty ||
      (current.mode !== 'edit' && current.mode !== 'markdown-preview')
    ) {
      return
    }
    setFileContents((previous) => {
      if (!previous[current.id]) {
        return previous
      }
      const next = { ...previous }
      delete next[current.id]
      return next
    })
    void loadFileContent(current.filePath, current.id, current.worktreeId, current.relativePath, {
      force: true
    })
  }, [
    activeFile?.fileContentReloadNonce,
    activeFile?.id,
    loadFileContent,
    openFilesRef,
    setFileContents
  ])
}
