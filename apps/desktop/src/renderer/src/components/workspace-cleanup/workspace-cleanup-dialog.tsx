import {
  Warning as AlertTriangle,
  MagnifyingGlass as Search,
  SlidersHorizontal,
  Trash as Trash2,
  ArrowCounterClockwise as RefreshCcw,
  X
} from '@phosphor-icons/react'
/* eslint-disable max-lines -- Why: the cleanup dialog keeps scan status,
   filters, row actions, localized review copy, and force-aware confirmation
   in one modal flow. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'

import { LoadingIndicator } from '@/components/loading-indicator'
import RepoMultiCombobox from '@/components/repo/repo-multi-combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'

import { isGitRepoKind } from '../../../../shared/repo-kind'
import {
  canQueueWorkspaceCleanupCandidate,
  type WorkspaceCleanupCandidate,
  type WorkspaceCleanupScanError,
  type WorkspaceCleanupScanProgress
} from '../../../../shared/workspace-cleanup'
import {
  startWorkspaceCleanupBackgroundRemoval,
  type WorkspaceCleanupRemovalProgress
} from './workspace-cleanup-background-removal'
import { WorkspaceCleanupCandidateList } from './workspace-cleanup-candidate-list'
import { CandidateRow } from './workspace-cleanup-candidate-row'
import {
  getCandidateStatus,
  getContextPillLabel,
  getDirtyGitLabel,
  getReviewPillTone,
  shouldShowGitMetadataChip
} from './workspace-cleanup-candidate-row-data'
import {
  filterWorkspaceCleanupCandidates,
  getWorkspaceCleanupReviewInfo,
  sortWorkspaceCleanupCandidates,
  type WorkspaceCleanupContextFilter,
  type WorkspaceCleanupFilters,
  type WorkspaceCleanupGitFilter,
  type WorkspaceCleanupReviewFilter,
  type WorkspaceCleanupReviewInfo,
  type WorkspaceCleanupSortDirection,
  type WorkspaceCleanupSortKey,
  type WorkspaceCleanupTimeFilter
} from './workspace-cleanup-presentation'
import { filterWorkspaceCleanupRemovalCandidates } from './workspace-cleanup-removal-candidates'
import { StatusPill } from './workspace-cleanup-status-pill'
import {
  resolveWorkspaceCleanupActiveView,
  type WorkspaceCleanupView,
  type WorkspaceCleanupViewCounts
} from './workspace-cleanup-view-selection'

const DEFAULT_FILTERS: WorkspaceCleanupFilters = {
  query: '',
  time: 'all',
  review: 'all',
  git: 'all',
  context: 'all'
}

const EMPTY_REVIEW_INFO: WorkspaceCleanupReviewInfo = {
  hasReview: false,
  label: null,
  state: null,
  provider: null,
  title: null
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) {
    return 'Never'
  }
  const deltaMs = Date.now() - timestamp
  if (deltaMs < 60_000) {
    return 'Just now'
  }
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 48) {
    return `${hours}h ago`
  }
  return `${Math.floor(hours / 24)}d ago`
}

function isDisconnectedRemoteScanError(message: string): boolean {
  return (
    message === 'SSH provider is unavailable.' ||
    message === 'Remote workspaces are not connected. Reconnect and refresh to check them.'
  )
}

function formatScanNoticeMessage(
  errors: WorkspaceCleanupScanError[],
  repoNameById: Map<string, string>
): string | null {
  const visibleErrors = errors.filter(
    (error) => !isDisconnectedRemoteScanError(error.message ?? '')
  )
  if (visibleErrors.length === 0) {
    return null
  }
  if (visibleErrors.length === 1) {
    const error = visibleErrors[0]
    const repoName = formatScanErrorRepoName(error, repoNameById)
    return `Could not check ${repoName}: ${formatScanErrorReason(error.message)}. Some inactive workspaces may be missing. Refresh to try again.`
  }
  const repoNames = visibleErrors
    .slice(0, 3)
    .map((error) => formatScanErrorRepoName(error, repoNameById))
    .join(', ')
  const moreCount = visibleErrors.length - 3
  const suffix = moreCount > 0 ? `, +${moreCount} more` : ''
  return `Could not check ${visibleErrors.length} repositories (${repoNames}${suffix}). Some inactive workspaces may be missing. Refresh to try again.`
}

function formatScanErrorRepoName(
  error: Partial<WorkspaceCleanupScanError>,
  repoNameById: Map<string, string>
): string {
  const repoName = error.repoName?.trim()
  if (repoName) {
    return repoName
  }
  const fallback = error.repoId ? repoNameById.get(error.repoId)?.trim() : ''
  return fallback || 'a repository'
}

function formatScanErrorReason(message: string | undefined): string {
  if (!message) {
    return 'Git could not list worktrees'
  }
  if (message === 'Could not scan workspace cleanup for this repository.') {
    return 'Git could not list worktrees'
  }
  return message.replace(/\.$/, '')
}

export default function WorkspaceCleanupDialog(): React.JSX.Element {
  const activeModal = useAppStore((s) => s.activeModal)
  const openModal = useAppStore((s) => s.openModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const scan = useAppStore((s) => s.workspaceCleanupScan)
  const scanProgress = useAppStore((s) => s.workspaceCleanupProgress)
  const loading = useAppStore((s) => s.workspaceCleanupLoading)
  const error = useAppStore((s) => s.workspaceCleanupError)
  const repos = useAppStore((s) => s.repos)
  const reviewStateInputs = useAppStore(
    useShallow((s) => ({
      worktreesByRepo: s.worktreesByRepo,
      hostedReviewCache: s.hostedReviewCache,
      repos: s.repos,
      settings: s.settings
    }))
  )
  const scanWorkspaceCleanup = useAppStore((s) => s.scanWorkspaceCleanup)
  const markCandidateViewed = useAppStore((s) => s.markWorkspaceCleanupCandidateViewed)
  const dismissCandidates = useAppStore((s) => s.dismissWorkspaceCleanupCandidates)
  const resetDismissals = useAppStore((s) => s.resetWorkspaceCleanupDismissals)
  const removeCandidates = useAppStore((s) => s.removeWorkspaceCleanupCandidates)
  const markWorktreesQueuedForDeletion = useAppStore((s) => s.markWorktreesQueuedForDeletion)
  const clearWorktreeDeleteState = useAppStore((s) => s.clearWorktreeDeleteState)
  const deletingWorktreeIds = useAppStore(
    useShallow(
      (s) =>
        new Set(
          Object.entries(s.deleteStateByWorktreeId)
            .filter(([, state]) => state.isDeleting)
            .map(([worktreeId]) => worktreeId)
        )
    )
  )

  const open = activeModal === 'workspace-cleanup'
  const openRef = useRef(open)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set())
  const [rowsScrollElement, setRowsScrollElement] = useState<HTMLDivElement | null>(null)
  const [activeView, setActiveView] = useState<WorkspaceCleanupView>('ready')
  const [confirming, setConfirming] = useState(false)
  const [confirmCandidates, setConfirmCandidates] = useState<WorkspaceCleanupCandidate[]>([])
  const [removalProgress, setRemovalProgress] = useState<WorkspaceCleanupRemovalProgress | null>(
    null
  )
  const [rowFailures, setRowFailures] = useState<Record<string, string>>({})
  const [repoSelection, setRepoSelection] = useState<ReadonlySet<string>>(() => new Set())
  const [filters, setFilters] = useState<WorkspaceCleanupFilters>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<WorkspaceCleanupSortKey>('activity')
  const [sortDirection, setSortDirection] = useState<WorkspaceCleanupSortDirection>('asc')
  const selectedDefaultsScanAtRef = useRef<number | null>(null)
  const autoScanAttemptedForOpenRef = useRef(false)
  const latestReadyToastScanAtRef = useRef<number | null>(null)
  const wasOpenRef = useRef(false)
  const removalInFlightRef = useRef(false)
  // Why: the dialog stays mounted across cleanup runs, so late settlements from
  // an earlier batch must not mutate a newer batch's row/selection state.
  const removalBatchIdRef = useRef(0)
  const mountedRef = useMountedRef()
  const eligibleRepos = useMemo(() => repos.filter((repo) => isGitRepoKind(repo)), [repos])
  const eligibleRepoIds = useMemo(() => eligibleRepos.map((repo) => repo.id), [eligibleRepos])

  useEffect(() => {
    openRef.current = open
  }, [open])

  const startWorkspaceCleanupScan = useCallback(
    (options: { notifyWhenReady?: boolean } = {}) => {
      setRowFailures({})
      void scanWorkspaceCleanup()
        .then((result) => {
          if (!mountedRef.current || !options.notifyWhenReady || openRef.current) {
            return
          }
          if (latestReadyToastScanAtRef.current === result.scannedAt) {
            return
          }
          latestReadyToastScanAtRef.current = result.scannedAt
          const suggestedCount = result.candidates.filter(
            (candidate) => candidate.selectedByDefault
          ).length
          toast.success(
            translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.0e2d235c63',
              'Inactive workspace scan ready'
            ),
            {
              description: formatWorkspaceCleanupReadyToastDescription(
                result.candidates.length,
                suggestedCount
              ),
              action: {
                label: translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4a35c08764',
                  'Review'
                ),
                onClick: () => openModal('workspace-cleanup')
              }
            }
          )
        })
        .catch((err: unknown) => {
          if (mountedRef.current) {
            toast.error(
              translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.662b8ec3f8',
                'Workspace cleanup scan failed'
              ),
              {
                description: err instanceof Error ? err.message : String(err)
              }
            )
          }
        })
    },
    [mountedRef, openModal, scanWorkspaceCleanup]
  )

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      autoScanAttemptedForOpenRef.current = false
      return
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true
      autoScanAttemptedForOpenRef.current = false
      if (!removalInFlightRef.current) {
        setActiveView('ready')
        setConfirming(false)
        setRowFailures({})
        setFilters(DEFAULT_FILTERS)
        setSortKey('activity')
        setSortDirection('asc')
        setSelectedIds(new Set())
      }
    }
    // Why: reopening mid-batch keeps the deletion progress view; a broad scan
    // started here would be discarded by the removal's scan invalidation, so
    // skip it while a removal batch is running (matches the reset guard above).
    if (!loading && !autoScanAttemptedForOpenRef.current && !removalInFlightRef.current) {
      autoScanAttemptedForOpenRef.current = true
      startWorkspaceCleanupScan({ notifyWhenReady: true })
    }
  }, [loading, open, startWorkspaceCleanupScan])

  useEffect(() => {
    if (!open) {
      return
    }
    setRepoSelection(new Set(eligibleRepoIds))
  }, [eligibleRepoIds, open])

  const candidates = useMemo(() => scan?.candidates ?? [], [scan?.candidates])
  const reviewInfoByWorktreeId = useMemo(() => {
    const infos = new Map<string, WorkspaceCleanupReviewInfo>()
    for (const candidate of candidates) {
      infos.set(candidate.worktreeId, getWorkspaceCleanupReviewInfo(candidate, reviewStateInputs))
    }
    return infos
  }, [candidates, reviewStateInputs])
  const effectiveRepoSelection = useMemo<ReadonlySet<string>>(() => {
    if (repoSelection.size > 0 || eligibleRepoIds.length === 0) {
      return repoSelection
    }
    return new Set(eligibleRepoIds)
  }, [eligibleRepoIds, repoSelection])
  const filteredCandidates = useMemo(() => {
    if (
      effectiveRepoSelection.size === 0 ||
      effectiveRepoSelection.size === eligibleRepoIds.length
    ) {
      return candidates
    }
    return candidates.filter((candidate) => effectiveRepoSelection.has(candidate.repoId))
  }, [candidates, effectiveRepoSelection, eligibleRepoIds.length])

  useEffect(() => {
    if (loading || !scan || selectedDefaultsScanAtRef.current === scan.scannedAt) {
      return
    }
    selectedDefaultsScanAtRef.current = scan.scannedAt
    if (removalInFlightRef.current) {
      return
    }
    setSelectedIds(getDefaultSelectedWorkspaceCleanupIds(scan.candidates, deletingWorktreeIds))
    setConfirming(false)
    setRowFailures({})
  }, [deletingWorktreeIds, loading, scan])

  const visibleCandidates = useMemo(() => {
    const rows = filteredCandidates.filter((candidate) => !candidate.blockers.includes('dismissed'))
    return sortWorkspaceCleanupCandidates(rows, 'activity', 'asc', reviewInfoByWorktreeId)
  }, [filteredCandidates, reviewInfoByWorktreeId])
  const hiddenCandidates = useMemo(
    () =>
      sortWorkspaceCleanupCandidates(
        filteredCandidates.filter((candidate) => candidate.blockers.includes('dismissed')),
        'activity',
        'asc',
        reviewInfoByWorktreeId
      ),
    [filteredCandidates, reviewInfoByWorktreeId]
  )
  const groups = useMemo(
    () => ({
      ready: visibleCandidates.filter((candidate) => candidate.tier === 'ready'),
      review: visibleCandidates.filter((candidate) => candidate.tier === 'review'),
      protected: visibleCandidates.filter((candidate) => candidate.tier === 'protected')
    }),
    [visibleCandidates]
  )
  const cleanupViewCounts = useMemo<WorkspaceCleanupViewCounts>(
    () => ({
      ready: groups.ready.length,
      review: groups.review.length,
      protected: groups.protected.length,
      hidden: hiddenCandidates.length
    }),
    [groups.protected.length, groups.ready.length, groups.review.length, hiddenCandidates.length]
  )
  const resolvedActiveView = resolveWorkspaceCleanupActiveView({
    requestedView: activeView,
    counts: cleanupViewCounts,
    open,
    loading,
    hasScan: scan != null
  })
  const repoNameById = useMemo(
    () => new Map(repos.map((repo) => [repo.id, repo.displayName || repo.path])),
    [repos]
  )
  const selectedScanErrors = useMemo(
    () => (scan?.errors ?? []).filter((error) => effectiveRepoSelection.has(error.repoId)),
    [effectiveRepoSelection, scan?.errors]
  )
  const scanNoticeMessage = useMemo(
    () => formatScanNoticeMessage(selectedScanErrors, repoNameById),
    [repoNameById, selectedScanErrors]
  )
  const hasAnyCandidates = candidates.length > 0
  const initialLoading = loading && !hasAnyCandidates
  const activeBaseRows =
    resolvedActiveView === 'hidden' ? hiddenCandidates : groups[resolvedActiveView]
  const activeRows = useMemo(
    () =>
      sortWorkspaceCleanupCandidates(
        filterWorkspaceCleanupCandidates(
          activeBaseRows,
          filters,
          reviewInfoByWorktreeId,
          scan?.scannedAt ?? Date.now()
        ),
        sortKey,
        sortDirection,
        reviewInfoByWorktreeId
      ),
    [activeBaseRows, filters, reviewInfoByWorktreeId, scan?.scannedAt, sortDirection, sortKey]
  )
  const activeRowIds = useMemo(
    () => new Set(activeRows.map((candidate) => candidate.worktreeId)),
    [activeRows]
  )
  const activeFilters = hasActiveWorkspaceCleanupFilters(filters)
  const selectedCandidates = useMemo(() => {
    const byId = new Map(activeRows.map((candidate) => [candidate.worktreeId, candidate]))
    return [...selectedIds]
      .map((id) => byId.get(id))
      .filter(
        (candidate): candidate is WorkspaceCleanupCandidate =>
          candidate != null &&
          canQueueWorkspaceCleanupCandidate(candidate) &&
          !deletingWorktreeIds.has(candidate.worktreeId)
      )
  }, [activeRows, deletingWorktreeIds, selectedIds])
  useEffect(() => {
    if (!open || confirming) {
      return
    }
    // Why: destructive selection must stay scoped to the rows the user can
    // currently review after tier/filter changes.
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((id) => activeRowIds.has(id) && !deletingWorktreeIds.has(id))
      )
      return next.size === current.size ? current : next
    })
  }, [activeRowIds, confirming, deletingWorktreeIds, open])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        closeModal()
      }
    },
    [closeModal]
  )

  const refresh = useCallback(() => {
    startWorkspaceCleanupScan({ notifyWhenReady: true })
  }, [startWorkspaceCleanupScan])

  const ignoreCandidate = useCallback(
    (candidate: WorkspaceCleanupCandidate) => {
      void dismissCandidates([candidate])
        .then(() => {
          if (mountedRef.current) {
            setSelectedIds((current) => {
              const next = new Set(current)
              next.delete(candidate.worktreeId)
              return next
            })
          }
        })
        .catch((err: unknown) => {
          if (mountedRef.current) {
            toast.error(
              translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7f451a3e2c',
                'Could not ignore cleanup suggestion'
              ),
              {
                description: err instanceof Error ? err.message : String(err)
              }
            )
          }
        })
    },
    [dismissCandidates, mountedRef]
  )

  const toggleExpandedRow = useCallback((worktreeId: string) => {
    setExpandedRowIds((current) => toggleSetMember(current, worktreeId))
  }, [])

  const toggleSelectedRow = useCallback((worktreeId: string) => {
    setSelectedIds((current) => toggleSetMember(current, worktreeId))
  }, [])

  const openConfirmRemove = useCallback((candidates: readonly WorkspaceCleanupCandidate[]) => {
    const nextCandidates = filterWorkspaceCleanupRemovalCandidates(
      candidates,
      useAppStore.getState().deleteStateByWorktreeId
    )
    if (nextCandidates.length === 0) {
      return
    }
    setConfirmCandidates(nextCandidates)
    setConfirming(true)
  }, [])

  // Why: stable per-row handlers so React.memo keeps unchanged CandidateRow
  // instances from re-rendering on scan stream-in and selection changes.
  const handleRemoveRow = useCallback(
    (candidate: WorkspaceCleanupCandidate) => {
      if (loading) {
        return
      }
      setSelectedIds(new Set([candidate.worktreeId]))
      openConfirmRemove([candidate])
    },
    [loading, openConfirmRemove]
  )

  const handleViewCandidate = useCallback(
    (candidate: WorkspaceCleanupCandidate) => {
      markCandidateViewed(candidate)
      closeModal()
      activateAndRevealWorktree(candidate.worktreeId)
    },
    [closeModal, markCandidateViewed]
  )

  const cancelConfirmRemove = useCallback(() => {
    if (removalProgress) {
      closeModal()
      return
    }
    setConfirming(false)
    setConfirmCandidates([])
  }, [closeModal, removalProgress])

  const clearQueuedDeleteState = useCallback(
    (worktreeId: string) => {
      const deleteState = useAppStore.getState().deleteStateByWorktreeId[worktreeId]
      // Why: candidates that fail before removal starts would otherwise stay
      // marked "Queued for deletion" in the sidebar; rows already in the
      // 'deleting' phase or failed with an error keep their own state.
      if (deleteState?.isDeleting && deleteState.error === null && deleteState.phase === 'queued') {
        clearWorktreeDeleteState(worktreeId)
      }
    },
    [clearWorktreeDeleteState]
  )

  const deselectRemovedIds = useCallback((removedIds: readonly string[]) => {
    if (removedIds.length === 0) {
      return
    }
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of removedIds) {
        next.delete(id)
      }
      return next
    })
  }, [])

  const confirmRemove = useCallback(() => {
    if (confirmCandidates.length === 0 || removalInFlightRef.current) {
      return
    }
    const removableCandidates = filterWorkspaceCleanupRemovalCandidates(
      confirmCandidates,
      useAppStore.getState().deleteStateByWorktreeId
    )
    if (removableCandidates.length === 0) {
      setConfirming(false)
      setConfirmCandidates([])
      return
    }
    removalInFlightRef.current = true
    removalBatchIdRef.current += 1
    const removalBatchId = removalBatchIdRef.current
    // Why: a hung late settlement retains these callbacks for the renderer's
    // lifetime; capture only ids so it cannot pin the candidate objects.
    const removableWorktreeIds = removableCandidates.map((candidate) => candidate.worktreeId)
    setRowFailures({})
    markWorktreesQueuedForDeletion(removableWorktreeIds)
    startWorkspaceCleanupBackgroundRemoval({
      candidates: removableCandidates,
      removeCandidates,
      onProgress: (progress) => {
        if (mountedRef.current) {
          setRemovalProgress(progress)
        }
      },
      onRowFailed: (failure) => {
        clearQueuedDeleteState(failure.worktreeId)
      },
      onResult: (result) => {
        const nextFailures: Record<string, string> = {}
        for (const failure of result.failures) {
          nextFailures[failure.worktreeId] = failure.message
          clearQueuedDeleteState(failure.worktreeId)
        }
        if (mountedRef.current) {
          setRowFailures(nextFailures)
          deselectRemovedIds(result.removedIds)
          setRemovalProgress(null)
          setConfirming(false)
          setConfirmCandidates([])
        }
        removalInFlightRef.current = false
      },
      onLateResult: (result) => {
        for (const failure of result.failures) {
          // Why: a late failure can come from a hung preflight whose row never
          // reached 'deleting'; clear its queued overlay like every other path.
          clearQueuedDeleteState(failure.worktreeId)
        }
        if (!mountedRef.current || removalBatchIdRef.current !== removalBatchId) {
          return
        }
        setRowFailures((current) => {
          const next = { ...current }
          for (const id of result.removedIds) {
            delete next[id]
          }
          for (const failure of result.failures) {
            next[failure.worktreeId] = failure.message
          }
          return next
        })
        deselectRemovedIds(result.removedIds)
      },
      onError: () => {
        for (const worktreeId of removableWorktreeIds) {
          clearWorktreeDeleteState(worktreeId)
        }
        if (mountedRef.current) {
          setRemovalProgress(null)
          setConfirming(false)
          setConfirmCandidates([])
        }
        removalInFlightRef.current = false
      }
    })
  }, [
    clearQueuedDeleteState,
    clearWorktreeDeleteState,
    confirmCandidates,
    deselectRemovedIds,
    markWorktreesQueuedForDeletion,
    mountedRef,
    removeCandidates
  ])

  const selectedCount = selectedCandidates.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(820px,90vh)] w-[calc(100vw-3rem)] max-w-[calc(100vw-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-3rem)] xl:w-[920px] xl:max-w-[920px]"
      >
        {!confirming ? (
          <>
            <DialogHeader className="border-border border-b px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle className="text-base">
                    {translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.b2c1331844',
                      'Delete Inactive Workspaces'
                    )}
                  </DialogTitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={translate(
                            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7ae2ad30f4',
                            'Refresh'
                          )}
                          onClick={refresh}
                          disabled={loading}
                        >
                          {loading ? (
                            <LoadingIndicator className="size-3.5" />
                          ) : (
                            <RefreshCcw weight="regular" className="size-3.5" />
                          )}
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom" sideOffset={4}>
                      {translate(
                        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7ae2ad30f4',
                        'Refresh'
                      )}
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.191f0bc98e',
                      'Close'
                    )}
                    onClick={() => closeModal()}
                  >
                    <X weight="regular" className="size-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {initialLoading ? (
              <div className="border-border bg-muted/25 flex items-start gap-2 border-b px-5 py-3">
                <LoadingIndicator className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-foreground text-xs font-medium">
                    {translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7eee951968',
                      'Checking inactive workspaces'
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.47123d0108',
                      'Scanning inactive workspaces. You can close this and come back.'
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs font-medium">
                    {formatWorkspaceCleanupProgress(scanProgress)}
                  </div>
                </div>
              </div>
            ) : hasAnyCandidates ? (
              <div className="border-border bg-muted/25 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="text-foreground min-w-0 text-sm font-medium">
                    {selectedCount}{' '}
                    {translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.ac5ba84cc1',
                      'selected'
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {eligibleRepos.length > 1 ? (
                    <div className="w-[220px] max-w-full">
                      <RepoMultiCombobox
                        repos={eligibleRepos}
                        selected={effectiveRepoSelection}
                        onChange={(next) => setRepoSelection(new Set(next))}
                        onSelectAll={() => setRepoSelection(new Set(eligibleRepoIds))}
                        triggerClassName="h-8 w-full border border-border/60 bg-background px-2 text-xs font-medium hover:bg-accent/60"
                      />
                    </div>
                  ) : null}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => openConfirmRemove(selectedCandidates)}
                    disabled={selectedCount === 0 || loading}
                  >
                    <Trash2 className="size-3.5" />
                    {translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.b771c92598',
                      'Delete selected'
                    )}
                  </Button>
                </div>
              </div>
            ) : null}

            {loading && scan && hasAnyCandidates ? (
              <div className="border-border bg-muted/25 border-b px-5 py-2">
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <LoadingIndicator className="size-3.5 shrink-0" />
                  <span>
                    {translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.9a3be9f2df',
                      'Scanning inactive workspaces. New rows appear here as they finish. You can close this and come back.'
                    )}
                  </span>
                  <span className="text-foreground font-medium">
                    {formatWorkspaceCleanupProgress(scanProgress)}
                  </span>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="border-destructive/30 bg-destructive/10 text-destructive border-b px-5 py-2 text-xs">
                {error}
              </div>
            ) : scanNoticeMessage ? (
              <div className="border-border bg-muted/25 text-muted-foreground flex items-center gap-2 border-b px-5 py-2 text-xs">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>{scanNoticeMessage}</span>
              </div>
            ) : null}

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[185px_minmax(0,1fr)]">
              <CleanupViewNav
                activeView={resolvedActiveView}
                counts={cleanupViewCounts}
                onViewChange={setActiveView}
              />
              <div className="border-border flex min-h-0 min-w-0 flex-col border-t md:border-t-0 md:border-l">
                {filteredCandidates.length > 0 ? (
                  <WorkspaceCleanupFilterToolbar
                    filters={filters}
                    showRestoreIgnored={
                      resolvedActiveView === 'hidden' && hiddenCandidates.length > 0
                    }
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    onFiltersChange={setFilters}
                    onSortKeyChange={setSortKey}
                    onSortDirectionChange={setSortDirection}
                    onRestoreIgnored={() => void resetDismissals()}
                  />
                ) : null}
                <ScrollArea className="min-h-0 flex-1" viewportRef={setRowsScrollElement}>
                  <div>
                    {initialLoading ? <SkeletonRows /> : null}
                    {!loading && scan && candidates.length === 0 && !scanNoticeMessage ? (
                      <EmptyState
                        title={translate(
                          'auto.components.workspace.cleanup.WorkspaceCleanupDialog.d3eef9463d',
                          'No inactive workspaces to delete.'
                        )}
                      />
                    ) : null}
                    {!loading && scan && candidates.length === 0 && scanNoticeMessage ? (
                      <EmptyState
                        title={translate(
                          'auto.components.workspace.cleanup.WorkspaceCleanupDialog.97c772c4fe',
                          'No inactive workspaces found in checked repositories.'
                        )}
                      />
                    ) : null}
                    {!loading &&
                    scan &&
                    candidates.length > 0 &&
                    filteredCandidates.length === 0 ? (
                      <EmptyState
                        title={translate(
                          'auto.components.workspace.cleanup.WorkspaceCleanupDialog.a19040cd67',
                          'No inactive workspaces match the selected repos.'
                        )}
                        actionLabel="Show all repos"
                        onAction={() => setRepoSelection(new Set(eligibleRepoIds))}
                      />
                    ) : null}
                    {!loading &&
                    scan &&
                    filteredCandidates.length > 0 &&
                    visibleCandidates.length === 0 ? (
                      <EmptyState
                        title={translate(
                          'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4719327c9c',
                          'All cleanup suggestions are ignored.'
                        )}
                        actionLabel="Review ignored workspaces"
                        onAction={() => setActiveView('hidden')}
                      />
                    ) : null}
                    {!loading &&
                    scan &&
                    activeRows.length === 0 &&
                    activeBaseRows.length > 0 &&
                    activeFilters ? (
                      <EmptyState
                        title={translate(
                          'auto.components.workspace.cleanup.WorkspaceCleanupDialog.3d957ff117',
                          'No workspaces match these filters.'
                        )}
                        actionLabel={translate(
                          'auto.components.workspace.cleanup.WorkspaceCleanupDialog.e94b1f8bb4',
                          'Clear filters'
                        )}
                        onAction={() => setFilters(DEFAULT_FILTERS)}
                      />
                    ) : null}
                    {!loading &&
                    scan &&
                    activeRows.length === 0 &&
                    visibleCandidates.length > 0 &&
                    !activeFilters ? (
                      <EmptyState
                        title={translate(
                          'auto.components.workspace.cleanup.WorkspaceCleanupDialog.f68d538c63',
                          'No workspaces in this cleanup set.'
                        )}
                      />
                    ) : null}
                    <WorkspaceCleanupCandidateList
                      rows={activeRows}
                      scrollElement={rowsScrollElement}
                      renderRow={(candidate, index) => (
                        <CandidateRow
                          key={candidate.worktreeId}
                          candidate={candidate}
                          reviewInfo={
                            reviewInfoByWorktreeId.get(candidate.worktreeId) ?? EMPTY_REVIEW_INFO
                          }
                          last={activeRows.length > 1 && index === activeRows.length - 1}
                          expanded={expandedRowIds.has(candidate.worktreeId)}
                          lastActivityLabel={formatRelativeTime(candidate.lastActivityAt)}
                          removing={loading || deletingWorktreeIds.has(candidate.worktreeId)}
                          selected={
                            selectedIds.has(candidate.worktreeId) &&
                            !loading &&
                            !deletingWorktreeIds.has(candidate.worktreeId)
                          }
                          failure={rowFailures[candidate.worktreeId]}
                          onToggleExpanded={toggleExpandedRow}
                          onToggleSelected={toggleSelectedRow}
                          onView={handleViewCandidate}
                          onIgnore={ignoreCandidate}
                          onRemove={handleRemoveRow}
                        />
                      )}
                    />
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        ) : (
          <ConfirmRemove
            candidates={confirmCandidates}
            reviewInfoByWorktreeId={reviewInfoByWorktreeId}
            progress={removalProgress}
            onCancel={cancelConfirmRemove}
            onConfirm={confirmRemove}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function WorkspaceCleanupFilterToolbar({
  filters,
  showRestoreIgnored,
  sortKey,
  sortDirection,
  onFiltersChange,
  onSortKeyChange,
  onSortDirectionChange,
  onRestoreIgnored
}: {
  filters: WorkspaceCleanupFilters
  showRestoreIgnored: boolean
  sortKey: WorkspaceCleanupSortKey
  sortDirection: WorkspaceCleanupSortDirection
  onFiltersChange: (filters: WorkspaceCleanupFilters) => void
  onSortKeyChange: (sortKey: WorkspaceCleanupSortKey) => void
  onSortDirectionChange: (direction: WorkspaceCleanupSortDirection) => void
  onRestoreIgnored: () => void
}): React.JSX.Element {
  const updateFilter = <K extends keyof WorkspaceCleanupFilters>(
    key: K,
    value: WorkspaceCleanupFilters[K]
  ): void => {
    onFiltersChange({ ...filters, [key]: value })
  }
  const hasHiddenControls = hasActiveWorkspaceCleanupPanelControls(filters, sortKey, sortDirection)
  const resetPanelControls = (): void => {
    onFiltersChange({
      ...filters,
      time: 'all',
      review: 'all',
      git: 'all',
      context: 'all'
    })
    onSortKeyChange('activity')
    onSortDirectionChange('asc')
  }

  return (
    <div className="border-border bg-muted/15 flex items-center gap-2 border-b px-3 py-2">
      <div className="relative min-w-0 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          value={filters.query}
          onChange={(event) => updateFilter('query', event.target.value)}
          placeholder={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.searchPlaceholder',
            'Search workspaces'
          )}
          className="h-8 pl-8 text-xs"
        />
      </div>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    type="button"
                    aria-label={translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.efb3843e75',
                      'Filter and sort workspaces'
                    )}
                    className="relative shrink-0"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    {hasHiddenControls ? (
                      <span
                        aria-hidden="true"
                        className="bg-primary absolute -top-0.5 -right-0.5 size-2"
                      />
                    ) : null}
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.efb3843e75',
              'Filter and sort workspaces'
            )}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={6} className="w-64 pb-2">
          <DropdownMenuLabel>
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.93b7381d50',
              'Filters'
            )}
          </DropdownMenuLabel>
          <WorkspaceCleanupMenuSub<WorkspaceCleanupTimeFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.ageFilter',
              'Age'
            )}
            value={filters.time}
            options={[
              ['all', 'Any age'],
              ['30d', '30d+'],
              ['90d', '90d+'],
              ['archived', 'Archived']
            ]}
            onChange={(value) => updateFilter('time', value)}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupReviewFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.reviewFilter',
              'Review'
            )}
            value={filters.review}
            options={[
              ['all', 'Any review'],
              ['no-review', 'No PR/MR'],
              ['has-review', 'Has PR/MR'],
              ['open-review', 'Open'],
              ['closed-review', 'Closed']
            ]}
            onChange={(value) => updateFilter('review', value)}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupGitFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.gitFilter',
              'Git'
            )}
            value={filters.git}
            options={[
              ['all', 'Any git'],
              ['clean', 'Clean'],
              ['dirty', 'Dirty'],
              ['unpushed', 'Unpushed'],
              ['unknown', 'Unknown']
            ]}
            onChange={(value) => updateFilter('git', value)}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupContextFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.contextFilter',
              'Context'
            )}
            value={filters.context}
            options={[
              ['all', 'Any context'],
              ['has-context', 'Has context'],
              ['no-context', 'No context']
            ]}
            onChange={(value) => updateFilter('context', value)}
          />
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.a615e24679',
              'Sort'
            )}
          </DropdownMenuLabel>
          <WorkspaceCleanupMenuSub<WorkspaceCleanupSortKey>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.sortBy',
              'Sort by'
            )}
            value={sortKey}
            options={[
              ['activity', 'Activity'],
              ['name', 'Name'],
              ['repo', 'Repo'],
              ['review', 'Review'],
              ['git', 'Git']
            ]}
            onChange={onSortKeyChange}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupSortDirection>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.sortDirection',
              'Direction'
            )}
            value={sortDirection}
            options={[
              ['asc', 'Ascending'],
              ['desc', 'Descending']
            ]}
            onChange={onSortDirectionChange}
          />
          {showRestoreIgnored ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRestoreIgnored}>
                {translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.aaee139eab',
                  'Restore ignored suggestions'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
          {hasHiddenControls ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetPanelControls}>
                {translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.e94b1f8bb4',
                  'Clear filters'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function WorkspaceCleanupMenuSub<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}): React.JSX.Element {
  const valueLabel = options.find(([optionValue]) => optionValue === value)?.[1] ?? value
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="truncate">{label}</span>
          <span className="text-muted-foreground truncate text-[11px] font-medium">
            {valueLabel}
          </span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map(([optionValue, optionLabel]) => (
            <DropdownMenuRadioItem
              key={optionValue}
              value={optionValue}
              onClick={(event) => event.preventDefault()}
              closeOnClick={false}
            >
              {optionLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function CleanupViewNav({
  activeView,
  counts,
  onViewChange
}: {
  activeView: WorkspaceCleanupView
  counts: WorkspaceCleanupViewCounts
  onViewChange: (view: WorkspaceCleanupView) => void
}): React.JSX.Element {
  const items: { view: WorkspaceCleanupView; label: string }[] = [
    {
      view: 'ready',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4b93a235d8',
        'Suggested'
      )
    },
    {
      view: 'review',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.d1094dd529',
        'Needs review'
      )
    },
    {
      view: 'protected',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.c4f4782c02',
        'Not suggested'
      )
    },
    {
      view: 'hidden',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.e8b3741ff7',
        'Ignored'
      )
    }
  ]

  return (
    <aside className="border-border bg-background border-t md:border-t-0">
      <div className="space-y-1 p-2">
        {items.map((item) => (
          <Button
            variant="ghost"
            size="sm"
            key={item.view}
            type="button"
            className={cn(
              'border-0 whitespace-normal font-normal focus-visible:bg-accent focus-visible:text-accent-foreground',
              'flex w-full justify-between gap-2 px-2 text-left text-xs text-muted-foreground transition-colors',
              activeView === item.view && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onViewChange(item.view)}
          >
            <span className="truncate">{item.label}</span>
            <span className="text-muted-foreground tabular-nums">{counts[item.view]}</span>
          </Button>
        ))}
      </div>
    </aside>
  )
}

function ConfirmRemove({
  candidates,
  reviewInfoByWorktreeId,
  progress,
  onCancel,
  onConfirm
}: {
  candidates: WorkspaceCleanupCandidate[]
  reviewInfoByWorktreeId: ReadonlyMap<string, WorkspaceCleanupReviewInfo>
  progress: WorkspaceCleanupRemovalProgress | null
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const count = candidates.length
  const deleting = progress !== null
  const progressValue = progress
    ? Math.min(100, Math.max(0, (progress.processedCount / progress.totalCount) * 100))
    : 0
  return (
    <>
      <DialogHeader className="border-border border-b px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="border-destructive/25 bg-destructive/10 text-destructive mt-0.5 flex size-8 shrink-0 items-center justify-center border">
              {deleting ? (
                <LoadingIndicator className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">
                {deleting
                  ? translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.deletingCount',
                      'Deleting workspaces: {{value0}}',
                      { value0: count }
                    )
                  : translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.deleteCount',
                      'Delete workspaces: {{value0}}?',
                      { value0: count }
                    )}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-xs leading-5">
                {deleting
                  ? translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.1d3503357d',
                      'You can close this and come back while deletion continues.'
                    )
                  : translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.38ca0b1400',
                      "This permanently deletes their local files. You can't undo this."
                    )}
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.191f0bc98e',
              'Close'
            )}
            onClick={onCancel}
          >
            <X weight="regular" className="size-4" />
          </Button>
        </div>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        {progress ? (
          <div className="border-border bg-muted/25 border-b px-5 py-3">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoadingIndicator className="size-3.5 shrink-0" />
              <span className="text-foreground font-medium">
                {formatWorkspaceCleanupRemovalProgress(progress)}
              </span>
            </div>
            <Progress value={progressValue} className="mt-2 h-1.5" />
          </div>
        ) : null}
        <div className="border-border flex items-center justify-between border-b px-5 py-2.5">
          <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.05em] uppercase">
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.selectedForDeletionCount',
              'Selected for deletion: {{value0}}',
              { value0: count }
            )}
          </div>
          <div className="text-muted-foreground text-xs">
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.592fbab446',
              'Sorted by oldest activity'
            )}
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {candidates.map((candidate, index) => (
            <ConfirmRemoveRow
              key={candidate.worktreeId}
              candidate={candidate}
              reviewInfo={reviewInfoByWorktreeId.get(candidate.worktreeId) ?? EMPTY_REVIEW_INFO}
              last={index === candidates.length - 1}
            />
          ))}
        </ScrollArea>
      </div>
      <DialogFooter className="border-border border-t px-5 py-3">
        <Button variant="outline" onClick={onCancel}>
          {deleting
            ? translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.191f0bc98e',
                'Close'
              )
            : translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.b6bae1eed1',
                'Cancel'
              )}
        </Button>
        {!deleting ? (
          <Button variant="destructive" onClick={onConfirm} disabled={count === 0}>
            <Trash2 className="size-4" />
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.deleteButtonCount',
              'Delete {{value0}}',
              { value0: count }
            )}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  )
}

function ConfirmRemoveRow({
  candidate,
  reviewInfo,
  last
}: {
  candidate: WorkspaceCleanupCandidate
  reviewInfo: WorkspaceCleanupReviewInfo
  last: boolean
}): React.JSX.Element {
  const dirtyLabel = getDirtyGitLabel(candidate)
  const branchDiffersFromName = candidate.branch !== candidate.displayName
  const contextPillLabel = getContextPillLabel(candidate)
  const showGitMetadataChip = shouldShowGitMetadataChip(candidate)
  const status = getCandidateStatus(candidate)
  return (
    <div className={cn('border-b border-border/60 px-5 py-2.5', last && 'border-b-0')}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="min-w-0 truncate text-sm font-medium">{candidate.displayName}</span>
        <span className="text-muted-foreground text-xs">
          {translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.352f15d6fc',
            'Last active'
          )}{' '}
          {formatRelativeTime(candidate.lastActivityAt)}
        </span>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        {reviewInfo.label ? (
          <StatusPill tone={getReviewPillTone(reviewInfo)}>{reviewInfo.label}</StatusPill>
        ) : null}
        {contextPillLabel ? <StatusPill>{contextPillLabel}</StatusPill> : null}
        {dirtyLabel && showGitMetadataChip ? (
          <StatusPill tone="destructive">{dirtyLabel}</StatusPill>
        ) : null}
      </div>
      <div className="text-muted-foreground mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
        <span className="min-w-0 truncate">{candidate.repoName}</span>
        {branchDiffersFromName ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 truncate font-mono">{candidate.branch}</span>
          </>
        ) : null}
      </div>
      <div className="text-muted-foreground/80 mt-0.5 min-w-0 truncate font-mono text-[11px]">
        {candidate.path}
      </div>
    </div>
  )
}

function hasActiveWorkspaceCleanupFilters(filters: WorkspaceCleanupFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.time !== 'all' ||
    filters.review !== 'all' ||
    filters.git !== 'all' ||
    filters.context !== 'all'
  )
}

function hasActiveWorkspaceCleanupPanelControls(
  filters: WorkspaceCleanupFilters,
  sortKey: WorkspaceCleanupSortKey,
  sortDirection: WorkspaceCleanupSortDirection
): boolean {
  return (
    filters.time !== 'all' ||
    filters.review !== 'all' ||
    filters.git !== 'all' ||
    filters.context !== 'all' ||
    sortKey !== 'activity' ||
    sortDirection !== 'asc'
  )
}

function getDefaultSelectedWorkspaceCleanupIds(
  candidates: readonly WorkspaceCleanupCandidate[],
  deletingWorktreeIds: ReadonlySet<string> = new Set()
): Set<string> {
  return new Set(
    candidates
      .filter(
        (candidate) => candidate.selectedByDefault && !deletingWorktreeIds.has(candidate.worktreeId)
      )
      .map((candidate) => candidate.worktreeId)
  )
}

function formatWorkspaceCleanupReadyToastDescription(
  inactiveCount: number,
  suggestedCount: number
): string {
  if (inactiveCount === 0) {
    return 'No inactive workspaces found.'
  }
  const inactiveNoun = inactiveCount === 1 ? 'workspace' : 'workspaces'
  const suggestedNoun = suggestedCount === 1 ? 'suggestion' : 'suggestions'
  return `${inactiveCount} inactive ${inactiveNoun} found, with ${suggestedCount} cleanup ${suggestedNoun}.`
}

function formatWorkspaceCleanupRemovalProgress(progress: WorkspaceCleanupRemovalProgress): string {
  const deletedText = translate(
    'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4c2990886e',
    '{{value0}}/{{value1}} deleted',
    {
      value0: progress.removedCount,
      value1: progress.totalCount
    }
  )
  if (progress.failedCount === 0) {
    return deletedText
  }
  return translate(
    'auto.components.workspace.cleanup.WorkspaceCleanupDialog.86ba852118',
    '{{value0}}, {{value1}} failed',
    {
      value0: deletedText,
      value1: progress.failedCount
    }
  )
}

function formatWorkspaceCleanupProgress(progress: WorkspaceCleanupScanProgress | null): string {
  if (!progress || progress.scannedWorktreeCount === 0) {
    return translate(
      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4cc5b73efe',
      'Finding inactive workspaces...'
    )
  }
  return translate(
    'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7b7bde5181',
    'Checked workspaces so far: {{value0}}',
    {
      value0: progress.scannedWorktreeCount
    }
  )
}

function SkeletonRows(): React.JSX.Element {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((index) => (
        <div key={index} className="border-border bg-muted/35 h-24 animate-pulse border" />
      ))}
    </div>
  )
}

function EmptyState({
  title,
  actionLabel,
  onAction
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
}): React.JSX.Element {
  return (
    <div className="border-border bg-muted/20 text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-3 border text-sm">
      <span>{title}</span>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

function toggleSetMember(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}
