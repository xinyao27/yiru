import { useCallback, useEffect, useMemo, useState } from 'react'

import { useRuntimeFileListForWorktree } from '@/components/quick-open-file-list'
import { basename } from '@/lib/path'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'

import { isGitRepoKind } from '../../../../shared/repo-kind'
import type { RightSidebarExplorerView } from '../../../../shared/types'
import {
  getNameFilterCollapsedPathsAfterExpand,
  getNextNameFilterCollapsedPaths,
  isFileExplorerNameFilterQueryTooLarge
} from './file-explorer-name-filter-projection'
import { getVisibleFileExplorerWorktreePath } from './file-explorer-reset'
import { buildFolderStatusMap, buildStatusMap } from './status-display'
import { useFileExplorerManualRefresh } from './use-file-explorer-manual-refresh'
import { useFileExplorerTree } from './use-file-explorer-tree'
import { useFileExplorerVisibleRowProjection } from './use-file-explorer-visible-row-projection'
import { useFileSearchPanel } from './use-file-search-panel'

export function useFileExplorerModel({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}) {
  const explorerView = useAppStore((state) => state.rightSidebarExplorerView)
  const showRightSidebarFiles = useAppStore((state) => state.showRightSidebarFiles)
  const showRightSidebarSearch = useAppStore((state) => state.showRightSidebarSearch)
  const [nameFilterQuery, setNameFilterQuery] = useState('')
  const [nameFilterCollapsedPaths, setNameFilterCollapsedPaths] = useState<Set<string>>(
    () => new Set()
  )
  const searchPanel = useFileSearchPanel(explorerView, workspacePanelTabId)
  const handleSelectExplorerView = useCallback(
    (view: RightSidebarExplorerView) => {
      if (view === 'files') {
        showRightSidebarFiles()
        return
      }
      const trimmedQuery = nameFilterQuery.trim()
      showRightSidebarSearch(trimmedQuery ? { query: trimmedQuery } : undefined)
    },
    [nameFilterQuery, showRightSidebarFiles, showRightSidebarSearch]
  )
  const handleClearNameFilter = useCallback(() => setNameFilterQuery(''), [])

  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const activeRuntimeEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, activeWorktreeId)
  )
  const supportsFolderDownload = useAppStore((state) => {
    if (activeRuntimeEnvironmentId || !activeRepo?.connectionId) {
      return false
    }
    return state.sshConnectionStates.get(activeRepo.connectionId)?.supportsFolderDownload === true
  })
  const expandedDirs = useAppStore((state) => state.expandedDirs)
  const showDotfiles = useAppStore((state) =>
    activeWorktreeId ? (state.showDotfilesByWorktree[activeWorktreeId] ?? true) : true
  )
  const worktreePath = activeWorktree?.path ?? null
  const runtimeDownloadContext = useMemo(
    () =>
      activeRuntimeEnvironmentId && activeWorktreeId && worktreePath
        ? {
            settings: { activeRuntimeEnvironmentId },
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId: activeRepo?.connectionId ?? undefined
          }
        : null,
    [activeRepo?.connectionId, activeRuntimeEnvironmentId, activeWorktreeId, worktreePath]
  )
  const isFilesViewActive = explorerView === 'files'
  const visibleFilesWorktreePath = getVisibleFileExplorerWorktreePath({
    explorerView,
    rightSidebarOpen: isVisible,
    worktreePath
  })
  const repoName = activeRepo?.displayName ?? (worktreePath ? basename(worktreePath) : '')
  const activeRepoSupportsGit = activeRepo ? isGitRepoKind(activeRepo) : false
  const expanded = useMemo(
    () =>
      activeWorktreeId ? (expandedDirs[activeWorktreeId] ?? new Set<string>()) : new Set<string>(),
    [activeWorktreeId, expandedDirs]
  )

  const tree = useFileExplorerTree(worktreePath, expanded, activeWorktreeId)
  const hasNameFilterQuery = nameFilterQuery.trim().length > 0
  const nameFilterQueryTooLarge = useMemo(
    () => isFileExplorerNameFilterQueryTooLarge(nameFilterQuery),
    [nameFilterQuery]
  )
  const hasNameFilter = isFilesViewActive && hasNameFilterQuery
  useEffect(() => {
    if (!hasNameFilter) {
      setNameFilterCollapsedPaths((current) => (current.size > 0 ? new Set() : current))
    }
  }, [hasNameFilter])
  const nameFilterFiles = useRuntimeFileListForWorktree({
    enabled: hasNameFilter && !nameFilterQueryTooLarge,
    worktreeId: activeWorktreeId
  })
  const nameFilterSource = useMemo(
    () =>
      hasNameFilter
        ? {
            query: nameFilterQuery,
            operationOwner: nameFilterFiles.operationOwner,
            relativePaths: nameFilterQueryTooLarge
              ? []
              : nameFilterFiles.loading && nameFilterFiles.files.length === 0
                ? null
                : nameFilterFiles.files
          }
        : null,
    [
      hasNameFilter,
      nameFilterFiles.files,
      nameFilterFiles.loading,
      nameFilterFiles.operationOwner,
      nameFilterQuery,
      nameFilterQueryTooLarge
    ]
  )
  const projection = useFileExplorerVisibleRowProjection(
    activeWorktreeId,
    visibleFilesWorktreePath,
    tree.dirCache,
    expanded,
    activeRepoSupportsGit && isFilesViewActive,
    showDotfiles,
    nameFilterSource,
    hasNameFilter ? nameFilterCollapsedPaths : null
  )
  const rowExpandedPaths = useMemo(
    () =>
      hasNameFilter
        ? projection.nameFilterExpandedPaths
        : projection.nameFilterExpandedPaths.size > 0
          ? new Set([...expanded, ...projection.nameFilterExpandedPaths])
          : expanded,
    [expanded, hasNameFilter, projection.nameFilterExpandedPaths]
  )
  const manualRefresh = useFileExplorerManualRefresh(tree.refreshTree)
  const gitStatusByWorktree = useAppStore((state) => state.gitStatusByWorktree)
  const entries = useMemo(
    () => (activeWorktreeId ? (gitStatusByWorktree[activeWorktreeId] ?? []) : []),
    [activeWorktreeId, gitStatusByWorktree]
  )
  const statusByRelativePath = useMemo(() => buildStatusMap(entries), [entries])
  const folderStatusByRelativePath = useMemo(() => buildFolderStatusMap(entries), [entries])
  const handleToggleNameFilterDir = useCallback(
    (_worktreeId: string, dirPath: string) => {
      setNameFilterCollapsedPaths((current) =>
        getNextNameFilterCollapsedPaths(current, dirPath, rowExpandedPaths.has(dirPath))
      )
    },
    [rowExpandedPaths]
  )
  const handleExpandNameFilterDir = useCallback((dirPath: string) => {
    setNameFilterCollapsedPaths((current) =>
      getNameFilterCollapsedPathsAfterExpand(current, dirPath)
    )
  }, [])

  return {
    view: {
      explorerView,
      isFilesViewActive,
      searchPanel,
      nameFilterQuery,
      setNameFilterQuery,
      handleClearNameFilter,
      handleSelectExplorerView,
      hasNameFilter,
      nameFilterFiles,
      nameFilterSource
    },
    owner: {
      activeWorktreeId,
      activeRepo,
      activeRuntimeEnvironmentId,
      worktreePath,
      visibleFilesWorktreePath,
      runtimeDownloadContext,
      supportsFolderDownload
    },
    tree: {
      ...tree,
      expanded,
      rowExpandedPaths,
      rowProjection: projection.rowProjection,
      visibleRowCount: projection.rowProjection.getVisibleCount(),
      ignoredByRelativePath: projection.ignoredByRelativePath
    },
    display: {
      repoName,
      activeRepoSupportsGit,
      showDotfiles,
      showGitIgnoredFiles: projection.showGitIgnoredFiles,
      manualRefresh,
      statusByRelativePath,
      folderStatusByRelativePath
    },
    actions: {
      toggleGitIgnoredFiles: projection.toggleGitIgnoredFiles,
      handleToggleNameFilterDir,
      handleExpandNameFilterDir
    }
  }
}

export type FileExplorerModel = ReturnType<typeof useFileExplorerModel>
