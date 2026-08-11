import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { getRepoOwnerRoutedSettings } from '~renderer/lib/repo-runtime-owner'
import { useAppStore } from '~renderer/store'
import { useRepoById, useWorktreeById } from '~renderer/store/selectors'
import type { GitHistoryItem } from '~shared/git/history'
import type { GitBranchChangeEntry } from '~shared/types'

import { showWorkspaceSidebar } from '../show-sidebar'
import type { SourceControlRowOpenEvent } from '../source-control/split-open'
import { useGitHistoryCommitActions } from '../use-git-history-commit-actions'
import { collectGitGraphBranchOptions, filterGitGraphItemsByBranches } from './branch-filter'
import { DEFAULT_GIT_GRAPH_COLUMN_WIDTHS, type GitGraphColumnWidths } from './column-widths'
import {
  computeGitGraphFindMatches,
  EMPTY_GIT_GRAPH_FIND_STATE,
  stepGitGraphFindIndex
} from './find-state'
import { EMPTY_GIT_GRAPH_STATE } from './state'
import { useGitGraphCommitWriteActions } from './use-commit-write-actions'

// Why: bounds selectParent's auto-load-more loop (below) so a parent id that
// can never surface — filtered out by the branch selector, or genuinely
// missing — can't page through history forever.
const MAX_PARENT_LOAD_MORE_ATTEMPTS = 20

const EMPTY_GIT_STATUS_ENTRIES: readonly unknown[] = []
// Why: a stable identity for "no commits yet" keeps every memo/callback below
// keyed on `items` from re-running every render — `graphState.result?.items
// ?? []` would otherwise allocate a fresh empty array each render.
const EMPTY_GIT_GRAPH_ITEMS: readonly GitHistoryItem[] = []

export function useGitGraphView({ worktreeId, tabId }: { worktreeId: string; tabId: string }) {
  const worktree = useWorktreeById(worktreeId)
  const repo = useRepoById(worktree?.repoId ?? null)
  const settings = useAppStore((s) => s.settings)
  const activeRepoSettings = useMemo(
    () => getRepoOwnerRoutedSettings(settings, repo ?? null),
    [settings, repo]
  )
  const worktreePath = worktree?.path ?? null

  const graphState = useAppStore((s) => s.gitGraphByWorktree[worktreeId] ?? EMPTY_GIT_GRAPH_STATE)
  const refreshGitGraph = useAppStore((s) => s.refreshGitGraph)
  const loadMoreGitGraph = useAppStore((s) => s.loadMoreGitGraph)
  const closeUnifiedTab = useAppStore((s) => s.closeUnifiedTab)
  const includeRemoteBranches = useAppStore(
    (s) => s.gitGraphIncludeRemoteBranchesByWorktree[worktreeId] ?? true
  )
  const setGitGraphIncludeRemoteBranches = useAppStore((s) => s.setGitGraphIncludeRemoteBranches)
  const selectedRefIds = useAppStore((s) => s.gitGraphSelectedRefIdsByWorktree[worktreeId] ?? null)
  const setGitGraphSelectedRefIds = useAppStore((s) => s.setGitGraphSelectedRefIds)
  const columnWidths = useAppStore(
    (s) => s.gitGraphColumnWidthsByWorktree[worktreeId] ?? DEFAULT_GIT_GRAPH_COLUMN_WIDTHS
  )
  const setGitGraphColumnWidths = useAppStore((s) => s.setGitGraphColumnWidths)
  const dirtyEntries = useAppStore(
    (s) => s.gitStatusByWorktree[worktreeId] ?? EMPTY_GIT_STATUS_ENTRIES
  )

  useEffect(() => {
    void refreshGitGraph(worktreeId)
  }, [refreshGitGraph, worktreeId])

  const loadedItems = graphState.result?.items ?? EMPTY_GIT_GRAPH_ITEMS
  const isLoading = graphState.status === 'loading' || graphState.status === 'refreshing'
  const isLoadingMore = graphState.status === 'loading-more'

  // Why: branch options list every ref seen on the loaded page regardless of
  // the current filter, so a filtered-down view can still reach every branch
  // in the dropdown.
  const branchOptions = useMemo(() => collectGitGraphBranchOptions(loadedItems), [loadedItems])
  // Why: this is the set actually rendered — the graph layout and find
  // matches must be built from it, not from `loadedItems`, or the SVG lanes
  // and search hits would include commits no row exists for.
  const items = useMemo(
    () => filterGitGraphItemsByBranches(loadedItems, selectedRefIds),
    [loadedItems, selectedRefIds]
  )

  const [expandedCommitId, setExpandedCommitId] = useState<string | null>(null)
  const toggleExpand = useCallback((id: string) => {
    setExpandedCommitId((current) => (current === id ? null : id))
  }, [])

  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState(EMPTY_GIT_GRAPH_FIND_STATE.query)
  const [findIndex, setFindIndex] = useState(EMPTY_GIT_GRAPH_FIND_STATE.currentIndex)
  const findMatchIds = useMemo(
    () => computeGitGraphFindMatches(items, findQuery),
    [items, findQuery]
  )
  const currentFindCommitId = findIndex >= 0 ? (findMatchIds[findIndex] ?? null) : null
  const findMatchIdSet = useMemo(() => new Set(findMatchIds), [findMatchIds])

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const scrollToCommit = useCallback((id: string) => {
    rowRefs.current.get(id)?.scrollIntoView({ block: 'center' })
  }, [])

  useEffect(() => {
    setFindIndex(findMatchIds.length > 0 ? 0 : -1)
  }, [findMatchIds])

  useEffect(() => {
    if (currentFindCommitId) {
      scrollToCommit(currentFindCommitId)
    }
  }, [currentFindCommitId, scrollToCommit])

  const stepFind = useCallback(
    (direction: 1 | -1) => {
      setFindIndex((current) => stepGitGraphFindIndex(findMatchIds.length, current, direction))
    },
    [findMatchIds.length]
  )

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindQuery('')
  }, [])

  useEffect(() => {
    const isMac = navigator.userAgent.includes('Mac')
    const handleKeyDown = (event: KeyboardEvent): void => {
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey
      if (modifierPressed && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFindOpen(true)
      } else if (event.key === 'Escape' && findOpen) {
        closeFind()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeFind, findOpen])

  const resolveSplitTargetGroupId = useCallback((): string | undefined => undefined, [])
  const {
    loadCommitFiles,
    openHistoryCommitDiff,
    openCommitFile,
    handleCommitAction: handleReadCommitAction
  } = useGitHistoryCommitActions({
    activeWorktreeId: worktreeId,
    worktreePath,
    activeRepoSettings,
    resolveSplitTargetGroupId
  })
  const { handleCommitAction, writeDialog, isWriting, closeWriteDialog, submitWriteDialog } =
    useGitGraphCommitWriteActions({
      worktreeId,
      worktreePath,
      activeRepoSettings,
      onReadAction: handleReadCommitAction
    })

  const openFile = useCallback(
    (entry: GitBranchChangeEntry, event?: SourceControlRowOpenEvent) => {
      const item = items.find((candidate) => expandedCommitId === candidate.id)
      if (item) {
        openCommitFile(item, entry, event)
      }
    },
    [expandedCommitId, items, openCommitFile]
  )

  const openAllChanges = useCallback(
    (commitId: string) => {
      const item = items.find((candidate) => candidate.id === commitId)
      if (item) {
        void openHistoryCommitDiff(item)
      }
    },
    [items, openHistoryCommitDiff]
  )

  // Why: a parent hash from a collapsed commit's details may not be on the
  // loaded page yet (skip-based paging). Rather than silently do nothing,
  // keep loading further pages until the parent shows up in `items` or there
  // is no more history / the attempt bound below is hit.
  const [pendingParentId, setPendingParentId] = useState<string | null>(null)
  const parentLoadAttemptsRef = useRef(0)

  const selectParent = useCallback(
    (parentId: string) => {
      if (items.some((item) => item.id === parentId)) {
        setExpandedCommitId(parentId)
        scrollToCommit(parentId)
        return
      }
      parentLoadAttemptsRef.current = 0
      setPendingParentId(parentId)
    },
    [items, scrollToCommit]
  )

  useEffect(() => {
    if (!pendingParentId) {
      return
    }
    if (items.some((item) => item.id === pendingParentId)) {
      setExpandedCommitId(pendingParentId)
      scrollToCommit(pendingParentId)
      setPendingParentId(null)
      return
    }
    if (isLoadingMore) {
      return
    }
    const attemptsExhausted = parentLoadAttemptsRef.current >= MAX_PARENT_LOAD_MORE_ATTEMPTS
    if (!graphState.result?.hasMore || attemptsExhausted) {
      toast.error(
        translate(
          'auto.components.workspace-panel.git-graph.useGitGraphView.a1b2c3d4e6',
          'Could not find that commit in the loaded history'
        )
      )
      setPendingParentId(null)
      return
    }
    parentLoadAttemptsRef.current += 1
    void loadMoreGitGraph(worktreeId)
  }, [
    pendingParentId,
    items,
    isLoadingMore,
    graphState.result?.hasMore,
    loadMoreGitGraph,
    worktreeId,
    scrollToCommit
  ])

  const handleColumnWidthsChange = useCallback(
    (widths: GitGraphColumnWidths) => setGitGraphColumnWidths(worktreeId, widths),
    [setGitGraphColumnWidths, worktreeId]
  )

  const close = useCallback(() => closeUnifiedTab(tabId), [closeUnifiedTab, tabId])
  const openUncommittedChanges = useCallback(
    () => showWorkspaceSidebar({ view: 'source-control', worktreeId }),
    [worktreeId]
  )

  return {
    graphState,
    items,
    // Why: view.tsx needs this to tell "filter matched zero commits in the
    // loaded page, but more history could still be fetched" apart from
    // "there is genuinely no more history to load" — both render as an empty
    // `items` array otherwise.
    hasLoadedItems: loadedItems.length > 0,
    isFiltered: selectedRefIds !== null,
    isLoading,
    isLoadingMore,
    hasMore: graphState.result?.hasMore ?? false,
    currentCommitId: graphState.result?.currentRef?.revision,
    isDirty: dirtyEntries.length > 0,
    branchOptions,
    selectedRefIds,
    setGitGraphSelectedRefIds: (refIds: string[] | null) =>
      setGitGraphSelectedRefIds(worktreeId, refIds),
    includeRemoteBranches,
    setIncludeRemoteBranches: (include: boolean) =>
      setGitGraphIncludeRemoteBranches(worktreeId, include),
    columnWidths,
    onColumnWidthsChange: handleColumnWidthsChange,
    expandedCommitId,
    toggleExpand,
    selectParent,
    rowRefs,
    loadCommitFiles,
    openFile,
    openAllChanges,
    handleCommitAction,
    writeDialog,
    isWriting,
    closeWriteDialog,
    submitWriteDialog,
    findOpen,
    setFindOpen,
    findQuery,
    setFindQuery,
    findIndex,
    findMatchIdSet,
    currentFindCommitId,
    stepFind,
    closeFind,
    onRefresh: () => void refreshGitGraph(worktreeId),
    onLoadMore: () => void loadMoreGitGraph(worktreeId),
    onOpenUncommittedChanges: openUncommittedChanges,
    onCloseGraph: close
  }
}
