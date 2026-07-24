import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { formatDiffComments } from '@/lib/diff-comments-format'
import { getRepoOwnerRoutedSettings } from '@/lib/repo-runtime-owner'
import { getWorktreeGitIdentityDisplay } from '@/lib/worktree-git-identity-display'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById, useWorktreeMap } from '@/store/selectors'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review'
import { selectWorktreeDiffCommentsOrEmpty } from '@/store/worktree-diff-comments-selector'

import {
  countPendingDiffCommentsClear,
  formatPendingDiffCommentsClearDescription,
  resolvePendingDiffCommentsClear,
  type PendingDiffCommentsClear
} from './diff-comments-clear-dialog-state'
import { selectReviewCacheData, selectReviewCacheEntry } from './review-cache-entry-selection'
import { useCopyFeedbackState } from './source-control-copy-feedback-state'
import { cancelSourceControlEditorRevealFrames } from './source-control-editor-reveal'
import {
  EMPTY_BRANCH_CHANGE_ENTRIES,
  EMPTY_GIT_STATUS_ENTRIES
} from './source-control-panel-constants'

export type SourceControlControllerInput = {
  isVisible: boolean
  workspacePanelTabId?: string
}

export function useSourceControlStoreState(scope: SourceControlControllerInput) {
  const refreshBranchCompareRef = useRef<() => Promise<void>>(async () => {})
  const refreshGitHistoryRef = useRef<() => Promise<void>>(async () => {})
  const sourceControlRef = useRef<HTMLDivElement | null>(null)
  const [fileListScrollElement, setFileListScrollElement] = useState<HTMLDivElement | null>(null)
  const isMac = useMemo(() => navigator.userAgent.includes('Mac'), [])
  const pendingCommentEditorRevealFrameIdsRef = useRef<number[]>([])
  const commitInFlightRef = useRef<Record<string, boolean>>({})
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const activeWorktreeInstanceId = activeWorktree?.instanceId
  const activeGroupId = useAppStore((s) =>
    activeWorktreeId ? s.activeGroupIdByWorktree[activeWorktreeId] : undefined
  )
  const worktreeMap = useWorktreeMap()
  const rightSidebarTab = useAppStore((s) => s.rightSidebarTab)
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const gitIdentityDisplay = activeWorktree ? getWorktreeGitIdentityDisplay(activeWorktree) : null
  const detachedHeadDisplay = gitIdentityDisplay?.kind === 'detached' ? gitIdentityDisplay : null
  const branchName = gitIdentityDisplay?.kind === 'branch' ? gitIdentityDisplay.branchName : ''
  const entries = useAppStore((s) =>
    activeWorktreeId
      ? (s.gitStatusByWorktree[activeWorktreeId] ?? EMPTY_GIT_STATUS_ENTRIES)
      : EMPTY_GIT_STATUS_ENTRIES
  )
  const activeGitStatusHead = useAppStore((s) =>
    activeWorktreeId ? (s.gitStatusHeadByWorktree?.[activeWorktreeId] ?? null) : null
  )
  const repositoryHuge = useAppStore((s) =>
    activeWorktreeId ? s.gitStatusHugeByWorktree?.[activeWorktreeId] : undefined
  )
  const branchEntries = useAppStore((s) =>
    activeWorktreeId
      ? (s.gitBranchChangesByWorktree[activeWorktreeId] ?? EMPTY_BRANCH_CHANGE_ENTRIES)
      : EMPTY_BRANCH_CHANGE_ENTRIES
  )
  const branchSummary = useAppStore((s) =>
    activeWorktreeId ? (s.gitBranchCompareSummaryByWorktree[activeWorktreeId] ?? null) : null
  )
  const conflictOperation = useAppStore((s) =>
    activeWorktreeId ? (s.gitConflictOperationByWorktree[activeWorktreeId] ?? 'unknown') : 'unknown'
  )
  const conflictOperationsByWorktree = useAppStore((s) => s.gitConflictOperationByWorktree)
  const remoteStatus = useAppStore((s) =>
    activeWorktreeId ? s.remoteStatusesByWorktree[activeWorktreeId] : undefined
  )
  const isRemoteOperationActive = useAppStore((s) => s.isRemoteOperationActive)
  const inFlightRemoteOpKind = useAppStore((s) => s.inFlightRemoteOpKind)
  const settings = useAppStore((s) => s.settings)
  const hostedReviewCacheKey =
    activeRepo && branchName
      ? getHostedReviewCacheKey(
          activeRepo.path,
          branchName,
          settings,
          activeRepo.id,
          activeRepo.connectionId,
          activeRepo.executionHostId,
          true
        )
      : null
  const activePrCacheKey =
    activeRepo && branchName
      ? getGitHubPRCacheKey(
          activeRepo.path,
          activeRepo.id,
          branchName,
          settings,
          activeRepo.connectionId,
          activeRepo.executionHostId,
          true
        )
      : null
  const hostedReviewEntry = useAppStore((s) =>
    selectReviewCacheEntry(s.hostedReviewCache, hostedReviewCacheKey)
  )
  const hostedReviewEntryData = hostedReviewEntry?.data ?? null
  const activePrFromQueue = useAppStore((s) => selectReviewCacheData(s.prCache, activePrCacheKey))
  const activeRepoSettings = useMemo(
    () => getRepoOwnerRoutedSettings(settings, activeRepo ?? null),
    [activeRepo, settings]
  )
  const updateSettings = useAppStore((s) => s.updateSettings)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const fetchHostedReviewForBranch = useAppStore((s) => s.fetchHostedReviewForBranch)
  const getHostedReviewCreationEligibility = useAppStore(
    (s) => s.getHostedReviewCreationEligibility
  )
  const createHostedReview = useAppStore((s) => s.createHostedReview)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const fetchPRForBranch = useAppStore((s) => s.fetchPRForBranch)
  const enqueueGitHubPRRefresh = useAppStore((s) => s.enqueueGitHubPRRefresh)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const setGitStatus = useAppStore((s) => s.setGitStatus)
  const updateWorktreeGitIdentity = useAppStore((s) => s.updateWorktreeGitIdentity)
  const beginGitBranchCompareRequest = useAppStore((s) => s.beginGitBranchCompareRequest)
  const setGitBranchCompareResult = useAppStore((s) => s.setGitBranchCompareResult)
  const clearGitBranchCompare = useAppStore((s) => s.clearGitBranchCompare)
  const fetchUpstreamStatus = useAppStore((s) => s.fetchUpstreamStatus)
  const ensureHostedReviewPushTarget = useAppStore((s) => s.ensureHostedReviewPushTarget)
  const setUpstreamStatus = useAppStore((s) => s.setUpstreamStatus)
  const pushBranch = useAppStore((s) => s.pushBranch)
  const pullBranch = useAppStore((s) => s.pullBranch)
  const fastForwardBranch = useAppStore((s) => s.fastForwardBranch)
  const syncBranch = useAppStore((s) => s.syncBranch)
  const rebaseFromBase = useAppStore((s) => s.rebaseFromBase)
  const fetchBranch = useAppStore((s) => s.fetchBranch)
  const revealInExplorer = useAppStore((s) => s.revealInExplorer)
  const trackConflictPath = useAppStore((s) => s.trackConflictPath)
  const openDiff = useAppStore((s) => s.openDiff)
  const openFile = useAppStore((s) => s.openFile)
  const setEditorViewMode = useAppStore((s) => s.setEditorViewMode)
  const setMarkdownViewMode = useAppStore((s) => s.setMarkdownViewMode)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)
  const openConflictFile = useAppStore((s) => s.openConflictFile)
  const openConflictReview = useAppStore((s) => s.openConflictReview)
  const openBranchDiff = useAppStore((s) => s.openBranchDiff)
  const createEmptySplitGroup = useAppStore((s) => s.createEmptySplitGroup)
  const groupsByWorktree = useAppStore((s) => s.groupsByWorktree)
  const activeGroupIdByWorktree = useAppStore((s) => s.activeGroupIdByWorktree)
  const openAllDiffs = useAppStore((s) => s.openAllDiffs)
  const openBranchAllDiffs = useAppStore((s) => s.openBranchAllDiffs)
  const deleteDiffComment = useAppStore((s) => s.deleteDiffComment)
  const clearDiffComments = useAppStore((s) => s.clearDiffComments)
  const clearDiffCommentsForFile = useAppStore((s) => s.clearDiffCommentsForFile)
  const setScrollToDiffCommentId = useAppStore((s) => s.setScrollToDiffCommentId)
  const diffCommentsForActive = useAppStore((s) =>
    selectWorktreeDiffCommentsOrEmpty(s, activeWorktreeId)
  )
  const diffCommentCount = diffCommentsForActive.length
  const diffCommentCountByPath = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of diffCommentsForActive) {
      map.set(c.filePath, (map.get(c.filePath) ?? 0) + 1)
    }
    return map
  }, [diffCommentsForActive])
  const diffCommentsPrompt = useMemo(
    () => formatDiffComments(diffCommentsForActive),
    [diffCommentsForActive]
  )
  const [diffCommentsExpanded, setDiffCommentsExpanded] = useState(false)
  const [diffCommentsCopied, showDiffCommentsCopied] = useCopyFeedbackState(false)
  const [pendingDiffCommentsClear, setPendingDiffCommentsClear] =
    useState<PendingDiffCommentsClear | null>(null)
  const [isClearingDiffComments, setIsClearingDiffComments] = useState(false)
  const setSourceControlRoot = useCallback((node: HTMLDivElement | null) => {
    // Why: markdown-note reveal frames target the Source Control surface; cancel
    // them when that surface unmounts instead of from a passive Effect.
    if (node === null) {
      cancelSourceControlEditorRevealFrames(pendingCommentEditorRevealFrameIdsRef)
    }
    sourceControlRef.current = node
  }, [])
  const handleCopyDiffComments = useCallback(async (): Promise<void> => {
    if (diffCommentsForActive.length === 0) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(diffCommentsPrompt)
      showDiffCommentsCopied(true)
    } catch {
      // Why: swallow — clipboard write can fail when the window isn't focused.
      // No dedicated error surface is warranted for a best-effort copy action.
    }
  }, [diffCommentsForActive, diffCommentsPrompt, showDiffCommentsCopied])
  const pendingDiffCommentsClearCount = useMemo(() => {
    return countPendingDiffCommentsClear(
      pendingDiffCommentsClear,
      activeWorktreeId,
      diffCommentsForActive
    )
  }, [activeWorktreeId, diffCommentsForActive, pendingDiffCommentsClear])
  const resolvedPendingDiffCommentsClear = resolvePendingDiffCommentsClear({
    activeWorktreeId,
    isClearing: isClearingDiffComments,
    pending: pendingDiffCommentsClear,
    pendingCount: pendingDiffCommentsClearCount
  })
  if (resolvedPendingDiffCommentsClear !== pendingDiffCommentsClear) {
    // Why: the confirmation is purely local UI state; clear impossible
    // confirmations before children observe a stale open dialog.
    setPendingDiffCommentsClear(resolvedPendingDiffCommentsClear)
  }
  const pendingDiffCommentsClearDescription = formatPendingDiffCommentsClearDescription(
    resolvedPendingDiffCommentsClear,
    pendingDiffCommentsClearCount
  )
  const handleConfirmDiffCommentsClear = useCallback(async (): Promise<void> => {
    const pending = resolvedPendingDiffCommentsClear
    if (!pending || isClearingDiffComments || pending.worktreeId !== activeWorktreeId) {
      return
    }
    if (pendingDiffCommentsClearCount === 0) {
      setPendingDiffCommentsClear(null)
      return
    }
    setIsClearingDiffComments(true)
    try {
      const ok =
        pending.kind === 'all'
          ? await clearDiffComments(pending.worktreeId)
          : await clearDiffCommentsForFile(pending.worktreeId, pending.filePath)
      if (ok) {
        setPendingDiffCommentsClear(null)
      } else {
        toast.error(
          translate(
            'auto.components.right.sidebar.SourceControl.eae7a1da5f',
            'Failed to clear notes.'
          )
        )
      }
    } finally {
      setIsClearingDiffComments(false)
    }
  }, [
    activeWorktreeId,
    clearDiffComments,
    clearDiffCommentsForFile,
    isClearingDiffComments,
    resolvedPendingDiffCommentsClear,
    pendingDiffCommentsClearCount
  ])
  const [filterExpanded, setFilterExpanded] = useState(false)
  return {
    ...scope,
    sourceControlRef,
    fileListScrollElement,
    setFileListScrollElement,
    isMac,
    pendingCommentEditorRevealFrameIdsRef,
    commitInFlightRef,
    activeWorktree,
    activeWorktreeId,
    activeTabId,
    activeWorktreeInstanceId,
    activeGroupId,
    worktreeMap,
    rightSidebarTab,
    activeRepo,
    gitIdentityDisplay,
    detachedHeadDisplay,
    branchName,
    entries,
    activeGitStatusHead,
    repositoryHuge,
    branchEntries,
    branchSummary,
    conflictOperation,
    conflictOperationsByWorktree,
    remoteStatus,
    isRemoteOperationActive,
    inFlightRemoteOpKind,
    settings,
    hostedReviewCacheKey,
    activePrCacheKey,
    hostedReviewEntry,
    hostedReviewEntryData,
    activePrFromQueue,
    activeRepoSettings,
    updateSettings,
    openSettingsTarget,
    openSettingsPage,
    fetchHostedReviewForBranch,
    getHostedReviewCreationEligibility,
    createHostedReview,
    updateWorktreeMeta,
    fetchPRForBranch,
    enqueueGitHubPRRefresh,
    updateRepo,
    setGitStatus,
    updateWorktreeGitIdentity,
    beginGitBranchCompareRequest,
    setGitBranchCompareResult,
    clearGitBranchCompare,
    fetchUpstreamStatus,
    ensureHostedReviewPushTarget,
    setUpstreamStatus,
    pushBranch,
    pullBranch,
    fastForwardBranch,
    syncBranch,
    rebaseFromBase,
    fetchBranch,
    revealInExplorer,
    trackConflictPath,
    openDiff,
    openFile,
    setEditorViewMode,
    setMarkdownViewMode,
    setPendingEditorReveal,
    openConflictFile,
    openConflictReview,
    openBranchDiff,
    createEmptySplitGroup,
    groupsByWorktree,
    activeGroupIdByWorktree,
    openAllDiffs,
    openBranchAllDiffs,
    deleteDiffComment,
    clearDiffComments,
    clearDiffCommentsForFile,
    setScrollToDiffCommentId,
    diffCommentsForActive,
    diffCommentCount,
    diffCommentCountByPath,
    diffCommentsPrompt,
    diffCommentsExpanded,
    setDiffCommentsExpanded,
    diffCommentsCopied,
    showDiffCommentsCopied,
    pendingDiffCommentsClear,
    setPendingDiffCommentsClear,
    isClearingDiffComments,
    setIsClearingDiffComments,
    setSourceControlRoot,
    handleCopyDiffComments,
    pendingDiffCommentsClearCount,
    resolvedPendingDiffCommentsClear,
    pendingDiffCommentsClearDescription,
    handleConfirmDiffCommentsClear,
    filterExpanded,
    setFilterExpanded,
    refreshBranchCompareRef,
    refreshGitHistoryRef
  }
}

export type SourceControlStoreStateController = ReturnType<typeof useSourceControlStoreState>
