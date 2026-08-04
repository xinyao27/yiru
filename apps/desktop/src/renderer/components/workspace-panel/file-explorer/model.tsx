import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRuntimeFileListForWorktree } from '~renderer/components/quick-open-file-list'
import { basename } from '~renderer/lib/path'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { useAppStore } from '~renderer/store'
import { useActiveWorktree, useRepoById } from '~renderer/store/selectors'
import { isGitRepoKind } from '~shared/repo-kind'
import type { RightSidebarExplorerView } from '~shared/types'

import { buildFolderStatusMap, buildStatusMap } from '../status-display'
import {
  getNameFilterCollapsedPathsAfterExpand,
  getNextNameFilterCollapsedPaths,
  isFileExplorerNameFilterQueryTooLarge
} from './name-filter-projection'
import { getVisibleFileExplorerWorktreePath } from './reset'
import { useFileSearchPanel } from './use-file-search-panel'
import { useFileExplorerManualRefresh } from './use-manual-refresh'
import { useFileExplorerTree } from './use-tree'
import { useFileExplorerVisibleRowProjection } from './use-visible-row-projection'

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

  const treeState = useFileExplorerTree(worktreePath, expanded, activeWorktreeId)
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
    treeState.dirCache,
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
  const manualRefresh = useFileExplorerManualRefresh(treeState.refreshTree)
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

  // Why: each hook above already memoizes its own values, but bundling them
  // into five inline object literals produced a fresh reference every render
  // regardless — one gitStatusByWorktree tick invalidated every consumer of
  // the model. useMemo per group so an unrelated update leaves the other
  // groups referentially stable for consumers that read them.
  //
  // useRuntimeFileListForWorktree (nameFilterFiles) returns a fresh wrapper
  // object every call even though its own fields are individually
  // useState-stable — same shape as the treeState/manualRefresh wrappers
  // below. Rebuild it from those leaves so `view`'s dependency array reads
  // the stable fields instead of the always-new wrapper.
  const nameFilterFilesStable = useMemo(
    () => ({
      files: nameFilterFiles.files,
      loading: nameFilterFiles.loading,
      loadError: nameFilterFiles.loadError,
      operationOwner: nameFilterFiles.operationOwner
    }),
    [
      nameFilterFiles.files,
      nameFilterFiles.loading,
      nameFilterFiles.loadError,
      nameFilterFiles.operationOwner
    ]
  )
  const view = useMemo(
    () => ({
      explorerView,
      isFilesViewActive,
      searchPanel,
      nameFilterQuery,
      setNameFilterQuery,
      handleClearNameFilter,
      handleSelectExplorerView,
      hasNameFilter,
      nameFilterFiles: nameFilterFilesStable,
      nameFilterSource
    }),
    [
      explorerView,
      isFilesViewActive,
      searchPanel,
      nameFilterQuery,
      setNameFilterQuery,
      handleClearNameFilter,
      handleSelectExplorerView,
      hasNameFilter,
      nameFilterFilesStable,
      nameFilterSource
    ]
  )
  const owner = useMemo(
    () => ({
      activeWorktreeId,
      activeRepo,
      activeRuntimeEnvironmentId,
      worktreePath,
      visibleFilesWorktreePath,
      runtimeDownloadContext
    }),
    [
      activeWorktreeId,
      activeRepo,
      activeRuntimeEnvironmentId,
      worktreePath,
      visibleFilesWorktreePath,
      runtimeDownloadContext
    ]
  )
  // Why: useFileExplorerTree returns a fresh wrapper object every render even
  // though its own fields (dirCache, loadDir, ...) are individually stable
  // via useState/useCallback. Depend on those leaf fields, not on
  // `treeState` itself, or this memo would recompute every render too.
  const tree = useMemo(
    () => ({
      dirCache: treeState.dirCache,
      setDirCache: treeState.setDirCache,
      rootCache: treeState.rootCache,
      rootError: treeState.rootError,
      loadDir: treeState.loadDir,
      statPath: treeState.statPath,
      markPathAsDirectory: treeState.markPathAsDirectory,
      refreshTree: treeState.refreshTree,
      refreshDir: treeState.refreshDir,
      resetAndLoad: treeState.resetAndLoad,
      expanded,
      rowExpandedPaths,
      rowProjection: projection.rowProjection,
      visibleRowCount: projection.rowProjection.getVisibleCount(),
      ignoredByRelativePath: projection.ignoredByRelativePath
    }),
    [
      treeState.dirCache,
      treeState.setDirCache,
      treeState.rootCache,
      treeState.rootError,
      treeState.loadDir,
      treeState.statPath,
      treeState.markPathAsDirectory,
      treeState.refreshTree,
      treeState.refreshDir,
      treeState.resetAndLoad,
      expanded,
      rowExpandedPaths,
      projection.rowProjection,
      projection.ignoredByRelativePath
    ]
  )
  // Why: same reasoning as `tree` above — useFileExplorerManualRefresh
  // returns a fresh wrapper each render around stable leaf values, so depend
  // on those leaves rather than on `manualRefresh` itself.
  const display = useMemo(
    () => ({
      repoName,
      activeRepoSupportsGit,
      showDotfiles,
      showGitIgnoredFiles: projection.showGitIgnoredFiles,
      manualRefresh: {
        isRefreshing: manualRefresh.isRefreshing,
        showRefreshSpinner: manualRefresh.showRefreshSpinner,
        handleRefresh: manualRefresh.handleRefresh
      },
      statusByRelativePath,
      folderStatusByRelativePath
    }),
    [
      repoName,
      activeRepoSupportsGit,
      showDotfiles,
      projection.showGitIgnoredFiles,
      manualRefresh.isRefreshing,
      manualRefresh.showRefreshSpinner,
      manualRefresh.handleRefresh,
      statusByRelativePath,
      folderStatusByRelativePath
    ]
  )
  const actions = useMemo(
    () => ({
      toggleGitIgnoredFiles: projection.toggleGitIgnoredFiles,
      handleToggleNameFilterDir,
      handleExpandNameFilterDir
    }),
    [projection.toggleGitIgnoredFiles, handleToggleNameFilterDir, handleExpandNameFilterDir]
  )

  // Why: without this outer memo, `model` would still be a fresh object
  // every render even with the five groups above stabilized, which would
  // defeat React.memo on any consumer that receives the whole model.
  return useMemo(
    () => ({ view, owner, tree, display, actions }),
    [view, owner, tree, display, actions]
  )
}

export type FileExplorerModel = ReturnType<typeof useFileExplorerModel>
