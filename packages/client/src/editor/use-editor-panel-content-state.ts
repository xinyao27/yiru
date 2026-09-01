import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OpenFile } from '~renderer/editor/state'
import { joinPath } from '~renderer/path'
import { useEventCallback } from '~renderer/react/use-event-callback'
import type { useAppStore } from '~renderer/store/state'

import {
  readEditorDiffContent,
  readEditorFileContent,
  stampCleanTabDiskBaseline
} from './panel-content-readers'
import type { DiffContent, FileContent } from './panel-content-types'
import { isReloadableSingleFileDiffTab } from './panel-diff-reload'
import { canUseChangesModeForFile } from './panel-file-mode'
import { useEditorPanelContentReload } from './use-editor-panel-content-reload'
import {
  useEditorPanelExternalContentEvents,
  usePruneClosedEditorContent
} from './use-editor-panel-external-content-events'
import { useEditorPanelFileLoadRetry } from './use-editor-panel-file-load-retry'
import { useLocalLogTail } from './use-local-log-tail'

type GitStatusByWorktree = ReturnType<typeof useAppStore.getState>['gitStatusByWorktree']
type EditorViewModeByFile = ReturnType<typeof useAppStore.getState>['editorViewMode']

type UseEditorPanelContentStateParams = {
  activeFile: OpenFile | null
  isChangesMode: boolean
  openFiles: OpenFile[]
  gitStatusEntries: GitStatusByWorktree[string] | undefined
  editorViewMode: EditorViewModeByFile
}

type UseEditorPanelContentStateResult = {
  fileContents: Record<string, FileContent>
  diffContents: Record<string, DiffContent>
  reloadContent: (file: OpenFile) => void
}

export function useEditorPanelContentState({
  activeFile,
  isChangesMode,
  openFiles,
  gitStatusEntries,
  editorViewMode
}: UseEditorPanelContentStateParams): UseEditorPanelContentStateResult {
  const [fileContents, setFileContents] = useState<Record<string, FileContent>>({})
  const [diffContents, setDiffContents] = useState<Record<string, DiffContent>>({})
  const diffContentsRef = useRef(diffContents)
  const fileLoadRetryAttemptsRef = useRef<Record<string, number>>({})
  // Why: per-tab read generations let a forced/external reload supersede an
  // older in-flight read so a slower stale promise cannot overwrite fresh state.
  const fileReadGenerationRef = useRef<Record<string, number>>({})
  const diffReadGenerationRef = useRef<Record<string, number>>({})
  const fileReadGenerationCounterRef = useRef(0)
  const diffReadGenerationCounterRef = useRef(0)
  const openFilesRef = useRef(openFiles)
  const editorViewModeRef = useRef(editorViewMode)
  useLayoutEffect(() => {
    diffContentsRef.current = diffContents
    openFilesRef.current = openFiles
    editorViewModeRef.current = editorViewMode
  }, [diffContents, editorViewMode, openFiles])
  const selectedConflictReviewFile =
    activeFile?.mode === 'conflict-review' && activeFile.conflictReview?.selectedFileId
      ? (openFiles.find((file) => file.id === activeFile.conflictReview?.selectedFileId) ?? null)
      : null

  const loadFileContent = useEventCallback(
    async (
      filePath: string,
      id: string,
      worktreeId?: string,
      relativePath?: string,
      options?: { force?: boolean }
    ): Promise<void> => {
      const generation = fileReadGenerationCounterRef.current + 1
      fileReadGenerationCounterRef.current = generation
      fileReadGenerationRef.current[id] = generation
      try {
        const restoredOpenFile = openFilesRef.current.find((file) => file.id === id)
        const result = await readEditorFileContent({
          filePath,
          force: options?.force,
          relativePath,
          restoredOpenFile,
          worktreeId
        })
        if (fileReadGenerationRef.current[id] !== generation) {
          return
        }
        delete fileLoadRetryAttemptsRef.current[id]
        setFileContents((prev) => ({ ...prev, [id]: result }))
        stampCleanTabDiskBaseline(id, result)
      } catch (err) {
        if (fileReadGenerationRef.current[id] !== generation) {
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        setFileContents((prev) => ({
          ...prev,
          [id]: { content: '', isBinary: false, loadError: message }
        }))
      }
    }
  )

  const loadDiffContent = useEventCallback(
    async (file: OpenFile | null, options?: { force?: boolean }): Promise<void> => {
      if (!file || (file.mode === 'edit' && !canUseChangesModeForFile(file))) {
        return
      }
      const generation = diffReadGenerationCounterRef.current + 1
      diffReadGenerationCounterRef.current = generation
      diffReadGenerationRef.current[file.id] = generation
      try {
        const result = await readEditorDiffContent(file, options?.force === true)
        if (diffReadGenerationRef.current[file.id] !== generation) {
          return
        }
        setDiffContents((prev) => ({ ...prev, [file.id]: result }))
      } catch (err) {
        if (diffReadGenerationRef.current[file.id] !== generation) {
          return
        }
        setDiffContents((prev) => ({
          ...prev,
          [file.id]: {
            kind: 'text',
            originalContent: '',
            modifiedContent: `Error loading diff: ${err}`,
            originalIsBinary: false,
            modifiedIsBinary: false
          }
        }))
      }
    }
  )

  // Why: the changed-on-disk banner's explicit reload on an unstaged diff tab
  // must refetch the diff body, not the plain file content — one entry point
  // branches on the tab mode so every consumer reloads the right store.
  const reloadContent = (file: OpenFile): void => {
    if (file.mode === 'diff') {
      setDiffContents((prev) => {
        if (!prev[file.id]) {
          return prev
        }
        const next = { ...prev }
        delete next[file.id]
        return next
      })
      void loadDiffContent(file, { force: true })
      return
    }
    delete fileLoadRetryAttemptsRef.current[file.id]
    setFileContents((prev) => {
      if (!prev[file.id]) {
        return prev
      }
      const next = { ...prev }
      delete next[file.id]
      return next
    })
    void loadFileContent(file.filePath, file.id, file.worktreeId, file.relativePath, {
      force: true
    })
  }

  useLocalLogTail({ openFiles, fileContents, setFileContents, reloadContent })

  useEffect(() => {
    if (activeFile?.mode === 'conflict-review' && !selectedConflictReviewFile) {
      const snapshotEntries = activeFile.conflictReview?.entries ?? []
      if (snapshotEntries.length === 0) {
        return
      }

      const snapshotPaths = new Set(snapshotEntries.map((entry) => entry.path))
      const liveEntries = gitStatusEntries ?? []
      for (const entry of liveEntries) {
        if (
          !snapshotPaths.has(entry.path) ||
          entry.conflictStatus !== 'unresolved' ||
          !entry.conflictKind ||
          entry.status === 'deleted'
        ) {
          continue
        }

        const absolutePath = joinPath(activeFile.filePath, entry.path)
        if (!fileContents[absolutePath]) {
          void loadFileContent(absolutePath, absolutePath, activeFile.worktreeId, entry.path)
        }
      }
      return
    }

    const fileToLoad = selectedConflictReviewFile ?? activeFile
    if (!fileToLoad || (activeFile?.mode === 'conflict-review' && !selectedConflictReviewFile)) {
      return
    }
    if (fileToLoad.mode === 'edit' || fileToLoad.mode === 'markdown-preview') {
      if (fileToLoad.conflict?.kind === 'conflict-placeholder') {
        return
      }
      if (!fileContents[fileToLoad.id]) {
        void loadFileContent(
          fileToLoad.filePath,
          fileToLoad.id,
          fileToLoad.worktreeId,
          fileToLoad.relativePath
        )
      }
      if (isChangesMode && !diffContents[fileToLoad.id]) {
        window.requestAnimationFrame(() => void loadDiffContent(fileToLoad))
      }
    } else if (isReloadableSingleFileDiffTab(fileToLoad) && !diffContents[fileToLoad.id]) {
      window.requestAnimationFrame(() => void loadDiffContent(fileToLoad))
    }
  }, [
    activeFile,
    diffContents,
    fileContents,
    gitStatusEntries,
    isChangesMode,
    loadDiffContent,
    loadFileContent,
    selectedConflictReviewFile
  ])

  useEditorPanelFileLoadRetry({
    activeFile,
    fileContents,
    fileLoadRetryAttemptsRef,
    loadFileContent,
    openFilesRef,
    setFileContents
  })

  useEditorPanelContentReload({
    activeFile,
    diffContentsRef,
    gitStatusEntries,
    isChangesMode,
    loadDiffContent,
    loadFileContent,
    openFilesRef,
    setDiffContents,
    setFileContents
  })

  useEditorPanelExternalContentEvents({
    loadDiffContent,
    loadFileContent,
    openFilesRef,
    editorViewModeRef,
    setFileContents,
    setDiffContents
  })
  usePruneClosedEditorContent(
    openFiles,
    fileLoadRetryAttemptsRef,
    fileReadGenerationRef,
    diffReadGenerationRef,
    setFileContents,
    setDiffContents
  )

  return { fileContents, diffContents, reloadContent }
}
