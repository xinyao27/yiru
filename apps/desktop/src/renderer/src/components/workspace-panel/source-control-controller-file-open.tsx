import { useCallback, useEffect, useMemo } from 'react'

import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { useAppStore } from '@/store'

import type { GitStatusEntry } from '../../../../shared/types'
import { isStageableStatusEntry } from './discard-all-sequence'
import {
  buildActiveOpenFileSignature,
  buildActiveOpenRowKeys
} from './source-control-active-open-file-keys'
import type { SourceControlActionModelController } from './source-control-controller-action-model'
import type { DropdownActionKind } from './source-control-dropdown-items'
import { getNextSourceControlViewMode } from './source-control-header-toolbar'
import {
  isSourceControlSplitOpenModifier,
  shouldOpenSourceControlRowAsPreview,
  type SourceControlRowOpenEvent
} from './source-control-split-open'
import { useSourceControlSelection, type FlatEntry } from './use-source-control-selection'

export function useSourceControlFileOpen(scope: SourceControlActionModelController) {
  const {
    activeGroupIdByWorktree,
    activeWorktreeId,
    createEmptySplitGroup,
    groupsByWorktree,
    handleAbortMerge,
    handleAbortRebase,
    handleCommit,
    handleCreatePullRequest,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isMac,
    openConflictFile,
    openDiff,
    openFile,
    prGenerating,
    rightSidebarTab,
    runCompoundCommitAction,
    runCreatePrIntent,
    runRemoteAction,
    setEditorViewMode,
    settings,
    sourceControlRef,
    sourceControlViewMode,
    trackConflictPath,
    updateSettings,
    visibleSelectionEntries,
    workspacePanelTabId,
    worktreePath
  } = scope
  const handleActionInvoke = useCallback(
    (kind: DropdownActionKind): void => {
      if (prGenerating || isCreatingPr || isCreatePrIntentInFlight) {
        return
      }
      switch (kind) {
        case 'commit':
          void handleCommit()
          return
        case 'commit_push':
          void runCompoundCommitAction('push')
          return
        case 'commit_sync':
          void runCompoundCommitAction('sync')
          return
        case 'abort_merge':
          void handleAbortMerge()
          return
        case 'abort_rebase':
          void handleAbortRebase()
          return
        case 'create_pr':
          void handleCreatePullRequest()
          return
        case 'push_create_pr':
          void runCreatePrIntent()
          return
        case 'push':
        case 'force_push':
        case 'pull':
        case 'fast_forward':
        case 'sync':
        case 'fetch':
        case 'publish':
        case 'rebase_base':
          void runRemoteAction(kind === 'rebase_base' ? 'rebase' : kind)
      }
    },
    [
      handleCommit,
      handleCreatePullRequest,
      handleAbortMerge,
      handleAbortRebase,
      isCreatingPr,
      isCreatePrIntentInFlight,
      prGenerating,
      runCreatePrIntent,
      runCompoundCommitAction,
      runRemoteAction
    ]
  )
  const resolveSplitTargetGroupId = useCallback(
    (event?: SourceControlRowOpenEvent): string | undefined => {
      if (!event || !activeWorktreeId || !isSourceControlSplitOpenModifier(event, isMac)) {
        return undefined
      }
      const sourceGroupId =
        activeGroupIdByWorktree[activeWorktreeId] ?? groupsByWorktree[activeWorktreeId]?.[0]?.id
      if (!sourceGroupId) {
        return undefined
      }
      return createEmptySplitGroup(activeWorktreeId, sourceGroupId, 'right') ?? undefined
    },
    [activeGroupIdByWorktree, activeWorktreeId, createEmptySplitGroup, groupsByWorktree, isMac]
  )
  const activeOpenFileSignature = useAppStore((s) => {
    if (!activeWorktreeId) {
      return null
    }
    if (s.activeTabTypeByWorktree?.[activeWorktreeId] !== 'editor') {
      return null
    }
    const activeFileId = s.activeFileIdByWorktree?.[activeWorktreeId]
    if (!activeFileId) {
      return null
    }
    const activeFile = s.openFiles?.find(
      (file) => file.id === activeFileId && file.worktreeId === activeWorktreeId
    )
    if (!activeFile) {
      return null
    }
    return buildActiveOpenFileSignature(activeFile.diffSource, activeFile.relativePath)
  })
  const activeOpenAvailableRowKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const entry of visibleSelectionEntries) {
      keys.add(entry.key)
    }
    return keys
  }, [visibleSelectionEntries])
  const activeOpenRowKeys = useMemo(
    () => buildActiveOpenRowKeys(activeOpenFileSignature, activeOpenAvailableRowKeys),
    [activeOpenAvailableRowKeys, activeOpenFileSignature]
  )
  const handleOpenDiff = useCallback(
    (entry: GitStatusEntry, event?: SourceControlRowOpenEvent) => {
      if (!activeWorktreeId || !worktreePath) {
        return
      }
      const targetGroupId = resolveSplitTargetGroupId(event)
      const embeddedTargetTabId = targetGroupId ? undefined : workspacePanelTabId
      const openAsPreview = shouldOpenSourceControlRowAsPreview(event, targetGroupId)
      if (entry.conflictKind && entry.conflictStatus) {
        if (entry.conflictStatus === 'unresolved') {
          trackConflictPath(activeWorktreeId, entry.path, entry.conflictKind)
        }
        openConflictFile(activeWorktreeId, worktreePath, entry, detectLanguage(entry.path), {
          targetGroupId,
          workspacePanelTabId: embeddedTargetTabId,
          preview: openAsPreview
        })
        return
      }
      const language = detectLanguage(entry.path)
      const filePath = joinPath(worktreePath, entry.path)
      // Why: unstaged Markdown shares its editable file entity in Changes mode;
      // staged or non-Markdown content still requires a dedicated diff entity.
      if (language === 'markdown' && entry.area === 'unstaged') {
        openFile(
          {
            filePath,
            relativePath: entry.path,
            worktreeId: activeWorktreeId,
            language,
            mode: 'edit'
          },
          { targetGroupId, workspacePanelTabId: embeddedTargetTabId, preview: openAsPreview }
        )
        setEditorViewMode(filePath, 'changes')
        return
      }
      openDiff(activeWorktreeId, filePath, entry.path, language, entry.area === 'staged', {
        targetGroupId,
        workspacePanelTabId: embeddedTargetTabId,
        preview: openAsPreview
      })
    },
    [
      activeWorktreeId,
      worktreePath,
      resolveSplitTargetGroupId,
      trackConflictPath,
      openConflictFile,
      openDiff,
      openFile,
      setEditorViewMode,
      workspacePanelTabId
    ]
  )
  const { selectedKeys, handleSelect, handleContextMenu, clearSelection } =
    useSourceControlSelection({
      flatEntries: visibleSelectionEntries,
      onOpenDiff: handleOpenDiff,
      shouldOpenAsSplit: (event) => isSourceControlSplitOpenModifier(event, isMac),
      containerRef: sourceControlRef
    })
  useEffect(() => {
    clearSelection()
  }, [sourceControlViewMode, clearSelection])
  const handleToggleSourceControlViewMode = useCallback(() => {
    if (!settings) {
      return
    }
    updateSettings({
      sourceControlViewMode: getNextSourceControlViewMode(sourceControlViewMode)
    })
  }, [settings, sourceControlViewMode, updateSettings])
  useEffect(() => {
    clearSelection()
  }, [activeWorktreeId, rightSidebarTab, clearSelection])
  const flatEntriesByKey = useMemo(
    () => new Map(visibleSelectionEntries.map((entry) => [entry.key, entry])),
    [visibleSelectionEntries]
  )
  const selectedEntries = useMemo(
    () =>
      Array.from(selectedKeys)
        .map((key) => flatEntriesByKey.get(key))
        .filter((entry): entry is FlatEntry => Boolean(entry)),
    [selectedKeys, flatEntriesByKey]
  )
  const bulkStagePaths = useMemo(
    () =>
      selectedEntries
        .filter((entry) => isStageableStatusEntry(entry.entry))
        .map((entry) => entry.entry.path),
    [selectedEntries]
  )
  const bulkUnstagePaths = useMemo(
    () =>
      selectedEntries
        // Why: submodule-internal rows are read-only from the parent worktree.
        .filter((entry) => entry.area === 'staged' && !entry.entry.submoduleRoot)
        .map((entry) => entry.entry.path),
    [selectedEntries]
  )
  const selectedKeySet = selectedKeys
  return {
    ...scope,
    handleActionInvoke,
    resolveSplitTargetGroupId,
    activeOpenFileSignature,
    activeOpenAvailableRowKeys,
    activeOpenRowKeys,
    handleOpenDiff,
    selectedKeys,
    handleSelect,
    handleContextMenu,
    clearSelection,
    handleToggleSourceControlViewMode,
    flatEntriesByKey,
    selectedEntries,
    bulkStagePaths,
    bulkUnstagePaths,
    selectedKeySet
  }
}

export type SourceControlFileOpenController = ReturnType<typeof useSourceControlFileOpen>
