import React, { useRef, useState } from 'react'
import {
  isLocalPathOpenBlocked,
  showLocalPathOpenBlockedToast
} from '~renderer/editor/local-path-open-guard'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { openFilePreviewToSide } from '~renderer/file-presentation/preview'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'

import { requestEditorFileSave } from './autosave'
import { exportActiveMarkdownToPdf } from './export-active-markdown'
import { getEditorHeaderCopyState } from './header'
import { extractFrontMatter } from './markdown-frontmatter'
import { createEditorPanelDraftSelector } from './panel-draft-selector'
import { canUseChangesModeForFile } from './panel-file-mode'
import {
  selectEditorPanelGitBranchEntries,
  selectEditorPanelGitStatusEntries
} from './panel-git-entry-selector'
import { getEditorPanelRenderModel } from './panel-render-model'
import { EditorPanelShell } from './panel-shell'
import { useEditorCmdSaveRequest } from './use-editor-cmd-save-request'
import { useEditorPanelContentState } from './use-editor-panel-content-state'
import { useMarkdownPreviewShortcut } from './use-markdown-preview-shortcut'
import { useUntitledFileRename } from './use-untitled-file-rename'
import type { EditorToggleValue } from './view-toggle'

function EditorPanelInner({
  activeFileId: activeFileIdProp,
  activeViewStateId: activeViewStateIdProp,
  markdownAnnotationsEnabled = true
}: {
  activeFileId?: string | null
  activeViewStateId?: string | null
  markdownAnnotationsEnabled?: boolean
} = {}): React.JSX.Element | null {
  const openFiles = useAppStore((s) => s.openFiles)
  const globalActiveFileId = useAppStore((s) => s.activeFileId)
  const activeFileId = activeFileIdProp ?? globalActiveFileId
  const activeViewStateId = activeViewStateIdProp ?? activeFileId
  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null
  const activeWorktreeId = activeFile?.worktreeId
  const markFileDirty = useAppStore((s) => s.markFileDirty)
  const pendingEditorReveal = useAppStore((s) => s.pendingEditorReveal)
  // Why: background Git refreshes for other worktrees must not wake every
  // mounted Monaco/rich editor pane.
  const gitStatusEntries = useAppStore((s) =>
    selectEditorPanelGitStatusEntries(s, activeWorktreeId)
  )
  const gitBranchEntries = useAppStore((s) =>
    selectEditorPanelGitBranchEntries(s, activeWorktreeId)
  )
  const markdownViewMode = useAppStore((s) => s.markdownViewMode)
  const setMarkdownViewMode = useAppStore((s) => s.setMarkdownViewMode)
  const editorViewMode = useAppStore((s) => s.editorViewMode)
  const setEditorViewMode = useAppStore((s) => s.setEditorViewMode)
  const openFile = useAppStore((s) => s.openFile)
  const openMarkdownPreview = useAppStore((s) => s.openMarkdownPreview)
  const markdownFrontmatterVisible = useAppStore((s) => s.markdownFrontmatterVisible)
  const setMarkdownFrontmatterVisible = useAppStore((s) => s.setMarkdownFrontmatterVisible)
  const markdownTableOfContentsVisible = useAppStore((s) => s.markdownTableOfContentsVisible)
  const setMarkdownTableOfContentsVisible = useAppStore((s) => s.setMarkdownTableOfContentsVisible)
  const closeFile = useAppStore((s) => s.closeFile)
  const clearUntitled = useAppStore((s) => s.clearUntitled)
  const editorDraftSelector = (() => createEditorPanelDraftSelector(activeFile))()
  const editorDrafts = useAppStore(editorDraftSelector)
  const setEditorDraft = useAppStore((s) => s.setEditorDraft)
  const settings = useAppStore((s) => s.settings)
  const panelRef = useRef<HTMLDivElement>(null)
  const [copiedPathToast, setCopiedPathToast] = useState<{ fileId: string; token: object } | null>(
    null
  )
  const copiedPathToastResetTimerRef = useRef<number | null>(null)
  // Why: clipboard IPC can resolve after the editor panel unmounts; skip path
  // toast feedback instead of starting a reset timer on a stale panel.
  const pathCopyMountedRef = useRef(false)
  const clearCopiedPathToastResetTimer = (): void => {
    if (copiedPathToastResetTimerRef.current === null) {
      return
    }
    window.clearTimeout(copiedPathToastResetTimerRef.current)
    copiedPathToastResetTimerRef.current = null
  }
  const setPanelRef = (node: HTMLDivElement | null) => {
    panelRef.current = node
    pathCopyMountedRef.current = node !== null
    if (!node) {
      clearCopiedPathToastResetTimer()
    }
  }
  const [sideBySide, setSideBySide] = useState(settings?.diffDefaultView === 'side-by-side')
  const [prevDiffView, setPrevDiffView] = useState(settings?.diffDefaultView)

  if (settings?.diffDefaultView !== prevDiffView) {
    setPrevDiffView(settings?.diffDefaultView)
    if (settings?.diffDefaultView !== undefined) {
      setSideBySide(settings.diffDefaultView === 'side-by-side')
    }
  }

  const requestedChangesMode =
    !!activeFile &&
    activeFile.mode === 'edit' &&
    canUseChangesModeForFile(activeFile) &&
    editorViewMode[activeFile.id] === 'changes'
  const { fileContents, diffContents, reloadContent } = useEditorPanelContentState({
    activeFile,
    isChangesMode: requestedChangesMode,
    openFiles,
    gitStatusEntries,
    editorViewMode
  })
  const isChangesMode =
    requestedChangesMode &&
    !!activeFile &&
    !fileContents[activeFile.id]?.isBinary &&
    !fileContents[activeFile.id]?.loadError
  const {
    renameDialogFile,
    renameError,
    requestRenameForFile,
    closeRenameDialog,
    handleRenameConfirm
  } = useUntitledFileRename({ openFiles, closeFile, openFile, clearUntitled })

  useMarkdownPreviewShortcut({ activeFile, panelRef, openMarkdownPreview })

  const handleContentChangeForFile = (file: typeof activeFile, content: string) => {
    if (!file) {
      return
    }
    setEditorDraft(file.id, content)
    const normalize =
      file.language === 'markdown'
        ? (value: string): string => value.trimEnd()
        : (value: string): string => value
    if (file.mode === 'edit') {
      markFileDirty(file.id, normalize(content) !== normalize(fileContents[file.id]?.content ?? ''))
      return
    }
    const diffContent = diffContents[file.id]
    const original = diffContent?.kind === 'text' ? diffContent.modifiedContent : ''
    markFileDirty(file.id, normalize(content) !== normalize(original))
  }

  const handleContentChange = (content: string) => {
    handleContentChangeForFile(activeFile, content)
  }

  const handleDirtyStateHint = (dirty: boolean) => {
    if (activeFile) {
      markFileDirty(activeFile.id, dirty)
    }
  }

  const handleSaveForFile = async (file: typeof activeFile, content: string) => {
    if (!file) {
      return
    }
    const saveTargetFile =
      file.mode === 'markdown-preview'
        ? (openFiles.find(
            (openFile) =>
              openFile.id === file.markdownPreviewSourceFileId && openFile.mode === 'edit'
          ) ?? null)
        : file
    if (!saveTargetFile) {
      return
    }
    if (saveTargetFile.isUntitled) {
      requestRenameForFile(saveTargetFile.id)
      return
    }
    try {
      await requestEditorFileSave({ fileId: saveTargetFile.id, fallbackContent: content })
    } catch {}
  }

  const handleSave = async (content: string) => {
    await handleSaveForFile(activeFile, content)
  }
  useEditorCmdSaveRequest({
    activeFile,
    activeViewStateId,
    openFiles,
    fileContents,
    handleSaveForFile,
    panelRef
  })

  const handleCopyPath = async (): Promise<void> => {
    if (!activeFile) {
      return
    }
    const copyState = getEditorHeaderCopyState(activeFile)
    if (!copyState.copyText) {
      return
    }
    try {
      await shellClient.ui.writeClipboardText(copyState.copyText)
      if (!pathCopyMountedRef.current) {
        return
      }
      clearCopiedPathToastResetTimer()
      const nextToast = { fileId: activeFile.id, token: {} }
      setCopiedPathToast(nextToast)
      copiedPathToastResetTimerRef.current = window.setTimeout(() => {
        copiedPathToastResetTimerRef.current = null
        setCopiedPathToast((current) => (current?.token === nextToast.token ? null : current))
      }, 1500)
    } catch {
      if (!pathCopyMountedRef.current) {
        return
      }
      clearCopiedPathToastResetTimer()
      setCopiedPathToast(null)
    }
  }

  if (!activeFile) {
    return null
  }
  const model = getEditorPanelRenderModel({
    activeFile,
    fileContents,
    editorDrafts,
    gitStatusEntries,
    gitBranchEntries,
    markdownViewMode,
    isChangesMode
  })

  const handleOpenPreviewToSide = (): void => {
    const state = useAppStore.getState()
    const sourceGroupId = activeViewStateId
      ? ((state.unifiedTabsByWorktree[activeFile.worktreeId] ?? []).find(
          (t) => t.id === activeViewStateId
        )?.groupId ?? null)
      : null
    openFilePreviewToSide({
      language: model.resolvedLanguage,
      filePath: activeFile.filePath,
      worktreeId: activeFile.worktreeId,
      sourceGroupId
    })
  }
  const handleOpenDiffTargetFile = (preferredMarkdownViewMode?: 'rich'): void => {
    if (!model.openFileState.canOpen) {
      return
    }
    openFile({
      filePath: activeFile.filePath,
      relativePath: activeFile.relativePath,
      worktreeId: activeFile.worktreeId,
      runtimeEnvironmentId: activeFile.runtimeEnvironmentId,
      language: detectLanguage(activeFile.relativePath),
      mode: 'edit'
    })
    if (preferredMarkdownViewMode) {
      setEditorViewMode(activeFile.filePath, 'edit')
      setMarkdownViewMode(activeFile.filePath, preferredMarkdownViewMode)
    }
  }
  const handleEditorToggleChange = (next: EditorToggleValue): void => {
    const fileId = activeFile.id
    if (activeFile.mode === 'diff' && model.isMarkdown && next === 'rich') {
      handleOpenDiffTargetFile('rich')
      return
    }
    if (next === 'changes') {
      setEditorViewMode(fileId, 'changes')
      return
    }
    setEditorViewMode(fileId, 'edit')
    if (next !== 'edit') {
      setMarkdownViewMode(fileId, next)
    }
  }
  const handleOpenMarkdownPreview = (): void => {
    openMarkdownPreview(
      {
        filePath: activeFile.filePath,
        relativePath: activeFile.relativePath,
        worktreeId: activeFile.worktreeId,
        runtimeEnvironmentId: activeFile.runtimeEnvironmentId,
        language: model.resolvedLanguage
      },
      { sourceFileId: activeFile.id }
    )
  }
  const handleOpenContainingFolder = (): void => {
    // Why: virtual editor tabs use synthetic ids instead of on-disk paths.
    if (activeFile.mode === 'check-details') {
      return
    }
    if (
      isLocalPathOpenBlocked(settingsForRuntimeOwner(settings, activeFile.runtimeEnvironmentId), {
        connectionId: getConnectionId(activeFile.worktreeId)
      })
    ) {
      showLocalPathOpenBlockedToast()
      return
    }
    shellClient.shell.openPath(activeFile.filePath)
  }
  const disableRenameBrowse = Boolean(
    settingsForRuntimeOwner(
      settings,
      renameDialogFile?.runtimeEnvironmentId
    )?.activeRuntimeEnvironmentId?.trim() ||
    (renameDialogFile ? getConnectionId(renameDialogFile.worktreeId) : null)
  )
  const markdownDocumentStateFileId =
    activeFile.mode === 'markdown-preview'
      ? (activeFile.markdownPreviewSourceFileId ?? activeFile.filePath)
      : activeFile.id
  let activeMarkdownContent: string | null = null
  if (activeFile.mode === 'markdown-preview') {
    activeMarkdownContent =
      editorDrafts[markdownDocumentStateFileId] ?? fileContents[activeFile.id]?.content ?? null
  } else if (activeFile.mode === 'edit') {
    activeMarkdownContent =
      editorDrafts[activeFile.id] ?? fileContents[activeFile.id]?.content ?? null
  }
  const canShowMarkdownFrontmatterToggle = Boolean(
    model.isMarkdown &&
    (activeFile.mode === 'markdown-preview' || model.mdViewMode !== 'source') &&
    activeMarkdownContent &&
    extractFrontMatter(activeMarkdownContent)
  )
  // Why: front-matter shows by default; the map only carries per-file hide overrides.
  const isMarkdownFrontmatterVisible =
    markdownFrontmatterVisible[markdownDocumentStateFileId] ?? true
  const isMarkdownTableOfContentsVisible =
    markdownTableOfContentsVisible[markdownDocumentStateFileId] ?? false

  return (
    // Why: each split pane needs an isolated bridge between its diff editor and header controls.
    <EditorPanelShell
      panelRef={setPanelRef}
      activeFile={activeFile}
      activeViewStateId={activeViewStateId}
      model={model}
      copiedPathVisible={copiedPathToast?.fileId === activeFile.id}
      showMarkdownTableOfContents={isMarkdownTableOfContentsVisible}
      canShowMarkdownFrontmatterToggle={canShowMarkdownFrontmatterToggle}
      markdownFrontmatterVisible={isMarkdownFrontmatterVisible}
      sideBySide={sideBySide}
      openFiles={openFiles}
      fileContents={fileContents}
      diffContents={diffContents}
      editorDrafts={editorDrafts}
      pendingEditorReveal={pendingEditorReveal}
      renameDialogFile={renameDialogFile}
      renameError={renameError}
      disableRenameBrowse={disableRenameBrowse}
      onCopyPath={() => void handleCopyPath()}
      onOpenDiffTargetFile={handleOpenDiffTargetFile}
      onOpenPreviewToSide={handleOpenPreviewToSide}
      onOpenMarkdownPreview={handleOpenMarkdownPreview}
      onOpenContainingFolder={handleOpenContainingFolder}
      onToggleSideBySide={() => setSideBySide((prev) => !prev)}
      onEditorToggleChange={handleEditorToggleChange}
      onToggleMarkdownTableOfContents={() =>
        setMarkdownTableOfContentsVisible(
          markdownDocumentStateFileId,
          !isMarkdownTableOfContentsVisible
        )
      }
      onToggleMarkdownFrontmatter={() =>
        setMarkdownFrontmatterVisible(markdownDocumentStateFileId, !isMarkdownFrontmatterVisible)
      }
      onExportMarkdownToPdf={() =>
        void exportActiveMarkdownToPdf({ fileId: activeFile.id, root: panelRef.current })
      }
      onContentChange={handleContentChange}
      onContentChangeForFile={handleContentChangeForFile}
      onDirtyStateHint={handleDirtyStateHint}
      onSave={handleSave}
      onSaveForFile={handleSaveForFile}
      onReloadContent={reloadContent}
      onCloseMarkdownTableOfContents={() =>
        setMarkdownTableOfContentsVisible(markdownDocumentStateFileId, false)
      }
      onCloseRenameDialog={closeRenameDialog}
      onRenameConfirm={handleRenameConfirm}
      markdownAnnotationsEnabled={markdownAnnotationsEnabled}
    />
  )
}

export default EditorPanelInner
