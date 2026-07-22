import {
  WarningCircle as AlertCircle,
  Warning as AlertTriangle,
  GitMerge,
  HardDrives as Server,
  HardDrive as ServerOff,
  Trash as Trash2
} from '@phosphor-icons/react'
/* eslint-disable max-lines -- Why: the worktree card centralizes sidebar card state (selection, drag, agent status, git info, context menu) in one cohesive component so sidebar rendering doesn't fan out across files. */
import React, { useEffect, useCallback, useState } from 'react'

import { DetachedHeadBadge } from '@/components/detached-head-badge'
import { LoadingIndicator } from '@/components/loading-indicator'
import { CaretDown as ChevronDown, FlowArrow as Workflow } from '@/components/regular-icons'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { recordRendererCrashBreadcrumb } from '@/lib/crash-diagnostics'
import { isMacAppDataPath } from '@/lib/passive-macos-app-data-access'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { getWorkspacePortsByWorktreeId } from '@/lib/workspace-port-groups'
import { getWorktreeGitIdentityDisplay } from '@/lib/worktree-git-identity-display'
import { useAppStore } from '@/store'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review'

import { DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE } from '../../../../shared/constants'
import { isRuntimeOwnedSshTargetId, parseExecutionHostId } from '../../../../shared/execution-host'
import type { HostedReviewInfo } from '../../../../shared/hosted-review'
import { hostedReviewInfoFromGitHubPRInfo } from '../../../../shared/hosted-review-github'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { SpoolOwnerControlGrantView } from '../../../../shared/spool/spool-ipc-contract'
import type { Worktree, Repo } from '../../../../shared/types'
import { folderWorkspaceKey, parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { AutoRenameFailedDialog } from './auto-rename-failed-dialog'
import CacheTimer, { usePromptCacheCountdownStartedAt } from './cache-timer'
import { runWorktreeDelete } from './delete-worktree-flow'
import { resolveRepoHeaderColor } from './project-header-color'
import { SshDisconnectedDialog } from './ssh-disconnected-dialog'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import { useWorktreeAgentRows } from './use-worktree-agent-rows'
import {
  canShowWorkspaceDeleteQuickAction,
  useWorkspaceDeleteModifierPressed
} from './workspace-delete-quick-action'
import { writeWorkspaceDragData } from './workspace-status'
import WorktreeCardAgents from './worktree-card-agents'
import { WorktreeCardControlGrants } from './worktree-card-control-grants'
import { useWorktreeCardDetailsHoverControl } from './worktree-card-details-hover-state'
import { isEventTargetInsideCurrentTarget } from './worktree-card-dom-events'
import { CONFLICT_OPERATION_LABELS } from './worktree-card-helpers'
import {
  WorktreeCardDetailsHover,
  hasWorktreeCardDetails,
  WorktreeCardMetaBadges
} from './worktree-card-meta'
import { WorktreeCardPortsDetails, WorktreeCardPortsTrigger } from './worktree-card-ports'
import {
  getWorktreeCardPrDisplay,
  isCachedMergedBranchPRCurrentForWorktree
} from './worktree-card-pr-display'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'
import { WorktreeCardStatusSlot } from './worktree-card-status-slot'
import { WorktreeCardSurface, type WorktreeCardSurfaceActiveVariant } from './worktree-card-surface'
import { getWorktreeCardTitleDisplay } from './worktree-card-title-display'
import WorktreeContextMenu from './worktree-context-menu'
import {
  getFlushWorktreeCardPaddingLeft,
  getWorktreeCardParentContentMarginLeft
} from './worktree-list-indentation'
import { WorktreeTitleInlineRename } from './worktree-title-inline-rename'

type WorktreeRenameRequest = {
  worktreeId: string
  rowKey?: string
}

export type ActiveSurfaceVariant = WorktreeCardSurfaceActiveVariant

type WorktreeCardProps = {
  worktree: Worktree
  repo: Repo | undefined
  isActive: boolean
  isCurrentWorktree?: boolean
  isActiveSurface?: boolean
  activeSurfaceVariant?: ActiveSurfaceVariant
  isMultiSelected?: boolean
  revealHighlight?: boolean
  revealHighlightTone?: 'default' | 'ai'
  selectedWorktrees?: readonly Worktree[]
  hideRepoBadge?: boolean
  hostContextLabel?: string
  inPinnedSection?: boolean
  activationRowKey?: string
  renameRowKey?: string
  contentIndent?: number
  flushSurface?: boolean
  lineageChildCount?: number
  lineageCollapsed?: boolean
  lineageChildren?: React.ReactNode
  lineageChildrenStyle?: React.CSSProperties
  onLineageToggle?: (event: React.MouseEvent<HTMLButtonElement>) => void
  isLineageDropTarget?: boolean
  onActivate?: () => void
  onImmediateActivate?: (worktreeId: string, rowKey: string | undefined) => void
  onSelectionGesture?: (event: React.MouseEvent<HTMLElement>, worktreeId: string) => boolean
  onContextMenuSelect?: (
    event: React.MouseEvent<HTMLElement>,
    worktree: Worktree
  ) => readonly Worktree[]
  onCardDragStart?: (
    event: React.DragEvent<HTMLDivElement>,
    worktreeId: string,
    draggedIds: readonly string[]
  ) => void
  onCardDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void
  nativeDragEnabled?: boolean
  affiliateListMode?: boolean
  statusPrDisplay?: WorktreeCardPrDisplay | null
  spoolControlGrants?: readonly SpoolOwnerControlGrantView[]
  spoolRevokingGrantIds?: ReadonlySet<string>
  onRevokeSpoolControlGrant?: (grantId: string) => void
}

const EMPTY_WORKSPACE_PORTS = []
const EMPTY_SPOOL_CONTROL_GRANTS: readonly SpoolOwnerControlGrantView[] = []
const EMPTY_SPOOL_REVOKING_GRANT_IDS: ReadonlySet<string> = new Set()
const HOSTED_REVIEW_CARD_REFRESH_INTERVAL_MS = 60_000

export function shouldBeginWorktreeRename(
  request: WorktreeRenameRequest | null,
  worktreeId: string,
  rowKey: string | undefined
): boolean {
  return (
    request?.worktreeId === worktreeId &&
    (request.rowKey === undefined || request.rowKey === rowKey)
  )
}

function formatSparseDirectoryPreview(directories: string[]): string {
  const preview = directories.slice(0, 4).join(', ')
  return directories.length <= 4 ? preview : `${preview}, +${directories.length - 4} more`
}

function isWebClient(): boolean {
  return Boolean((window as unknown as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__)
}

// Why: the pinned repo icon and the compact inline badge share one chip shell;
// keep the box + tooltip identical so both repo cues read as the same affordance.
function RepoIdentityChip({
  repo,
  children
}: {
  repo: Repo
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="border-sidebar-border bg-sidebar-accent/55 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border"
            aria-label={translate(
              'auto.components.sidebar.WorktreeCard.35ccfe2475',
              'Project {{value0}}',
              { value0: repo.displayName }
            )}
          >
            {children}
          </span>
        }
      />
      <TooltipContent side="right" sideOffset={8}>
        {repo.displayName}
      </TooltipContent>
    </Tooltip>
  )
}

const WorktreeCard = React.memo(function WorktreeCard({
  worktree,
  repo,
  isActive,
  isActiveSurface = isActive,
  activeSurfaceVariant = 'primary',
  isMultiSelected = false,
  revealHighlight = false,
  revealHighlightTone = 'default',
  selectedWorktrees,
  onActivate,
  onImmediateActivate,
  onSelectionGesture,
  onContextMenuSelect,
  onCardDragStart,
  onCardDragEnd,
  nativeDragEnabled = true,
  hideRepoBadge,
  hostContextLabel,
  inPinnedSection = false,
  activationRowKey,
  renameRowKey,
  contentIndent = 0,
  flushSurface = false,
  lineageChildCount = 0,
  lineageCollapsed = false,
  lineageChildren,
  lineageChildrenStyle,
  onLineageToggle,
  isLineageDropTarget = false,
  affiliateListMode = false,
  statusPrDisplay = null,
  spoolControlGrants = EMPTY_SPOOL_CONTROL_GRANTS,
  spoolRevokingGrantIds = EMPTY_SPOOL_REVOKING_GRANT_IDS,
  onRevokeSpoolControlGrant
}: WorktreeCardProps) {
  const openModal = useAppStore((s) => s.openModal)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const setPendingAutomationRunNavigation = useAppStore((s) => s.setPendingAutomationRunNavigation)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const deleteFolderWorkspace = useAppStore((s) => s.deleteFolderWorkspace)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const renamingWorktreeId = useAppStore((s) => s.renamingWorktreeId)
  const setRenamingWorktreeId = useAppStore((s) => s.setRenamingWorktreeId)
  const fetchHostedReviewForBranch = useAppStore((s) => s.fetchHostedReviewForBranch)
  const settings = useAppStore((s) => s.settings)
  const cardProps = useAppStore((s) => s.worktreeCardProperties)
  const agentActivityDisplayMode =
    useAppStore((s) => s.agentActivityDisplayMode) ?? DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
  const projectGroups = useAppStore((s) => s.projectGroups)
  const handleEditComment = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      openModal('edit-meta', {
        worktreeId: worktree.id,
        currentDisplayName: worktree.displayName,
        currentPR: worktree.linkedPR,
        currentComment: worktree.comment,
        focus: 'comment'
      })
    },
    [worktree, openModal]
  )

  const handleOpenAutomation = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const automationId = worktree.automationProvenance?.automationId
      if (!automationId) {
        return
      }
      const hostId = worktree.automationProvenance?.hostId ?? worktree.hostId
      setPendingAutomationRunNavigation({
        automationId,
        runId: null,
        ...(hostId ? { hostId } : {})
      })
      openAutomationsPage()
    },
    [
      openAutomationsPage,
      setPendingAutomationRunNavigation,
      worktree.automationProvenance?.automationId,
      worktree.automationProvenance?.hostId,
      worktree.hostId
    ]
  )

  const handleOpenAutomationRun = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const provenance = worktree.automationProvenance
      if (!provenance) {
        return
      }
      const hostId = provenance.hostId ?? worktree.hostId
      setPendingAutomationRunNavigation({
        automationId: provenance.automationId,
        runId: provenance.automationRunId,
        ...(hostId ? { hostId } : {})
      })
      openAutomationsPage()
    },
    [
      openAutomationsPage,
      setPendingAutomationRunNavigation,
      worktree.automationProvenance,
      worktree.hostId
    ]
  )

  const deleteState = useAppStore((s) => s.deleteStateByWorktreeId[worktree.id])
  const conflictOperation = useAppStore((s) => s.gitConflictOperationByWorktree[worktree.id])
  const remoteBranchConflict = useAppStore((s) => s.remoteBranchConflictByWorktreeId[worktree.id])
  const workspacePorts = useAppStore(
    (s) =>
      getWorkspacePortsByWorktreeId(s.workspacePortScan?.result).get(worktree.id) ??
      EMPTY_WORKSPACE_PORTS
  )

  // SSH disconnected state
  const sshStatus = useAppStore((s) => {
    // Why: runtime-owned (per-workspace-env) SSH targets are hidden and their relay health is
    // owned by the runtime layer — Yiru suppresses their ssh:state-changed broadcasts, so their
    // state is absent here. Don't show a false "disconnected" SSH chip for them.
    if (!repo?.connectionId || isRuntimeOwnedSshTargetId(repo.connectionId)) {
      return null
    }
    const state = s.sshConnectionStates.get(repo.connectionId)
    return state?.status ?? 'disconnected'
  })
  const isSshDisconnected = sshStatus != null && sshStatus !== 'connected'
  // Why: a terminal view already carries its own in-pane reconnect overlay, so
  // the blocking dialog would just duplicate it there; reserve the dialog for
  // views without an in-context prompt. Default to terminal (suppress) for the
  // ambiguous case so we err toward non-blocking.
  const activeViewIsTerminal = useAppStore(
    (s) => (s.activeTabTypeByWorktree?.[worktree.id] ?? 'terminal') === 'terminal'
  )

  // Why: runtime ("Yiru server") hosts get the same disconnected treatment as
  // SSH — when the host's runtime environment has no live status, its worktrees
  // are dimmed and marked disconnected instead of looking fully available.
  const isRuntimeDisconnected = useAppStore((s) => {
    const parsed = parseExecutionHostId(repo?.executionHostId)
    if (parsed?.kind !== 'runtime') {
      return false
    }
    return !s.runtimeStatusByEnvironmentId.get(parsed.environmentId)?.status
  })
  // Why: the reconnect dialog is blocking, so it is never auto-shown for a
  // disconnected worktree just because it is the active/restored card — that
  // would steal focus app-wide while the user works elsewhere. The card chip,
  // status bar, and terminal overlay carry the non-blocking disconnected state;
  // the dialog only opens on deliberate focus (see handleClick).
  const [showDisconnectedDialog, setShowDisconnectedDialog] = useState(false)
  const [titleRenaming, setTitleRenaming] = useState(false)
  const [showRenameErrorDialog, setShowRenameErrorDialog] = useState(false)
  // Why: read the target label from the store (populated during hydration in
  // use-ipc-events.ts) instead of calling listTargets IPC per card instance.
  const sshTargetLabel = useAppStore((s) =>
    repo?.connectionId ? (s.sshTargetLabels.get(repo.connectionId) ?? '') : ''
  )

  const gitIdentityDisplay = getWorktreeGitIdentityDisplay(worktree)
  const detachedHeadDisplay = gitIdentityDisplay?.kind === 'detached' ? gitIdentityDisplay : null
  const branch = gitIdentityDisplay?.kind === 'branch' ? gitIdentityDisplay.branchName : ''
  const workspaceScope = parseWorkspaceKey(worktree.id)
  const folderWorkspaceId =
    workspaceScope?.type === 'folder' ? workspaceScope.folderWorkspaceId : null
  const isFolder = repo ? isFolderRepo(repo) : folderWorkspaceId !== null
  // Why: project groups are the product gate for folder workspaces, so folder
  // paths stay hidden from identity surfaces until that capability exists.
  const hasProjectGroups = projectGroups.length > 0
  const branchIdentityDisplay = !isFolder && branch.length > 0 ? branch : undefined
  const folderPathIdentityDisplay =
    isFolder && hasProjectGroups && worktree.path.trim().length > 0 ? worktree.path : undefined
  const identityDisplay = branchIdentityDisplay ?? folderPathIdentityDisplay
  const hasPathIdentityEnabled = cardProps.includes('branch')
  const showIdentity = hasPathIdentityEnabled && Boolean(identityDisplay)
  const hostedReviewCacheKey =
    repo && branch
      ? getHostedReviewCacheKey(
          repo.path,
          branch,
          settings,
          repo.id,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : ''
  const prCacheKey =
    repo && branch
      ? getGitHubPRCacheKey(
          repo.path,
          repo.id,
          branch,
          settings,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : ''
  // Subscribe to ONLY the specific cache entry, not entire review/issue caches.
  const hostedReviewEntry = useAppStore((s) =>
    hostedReviewCacheKey ? s.hostedReviewCache[hostedReviewCacheKey] : undefined
  )
  const prCacheEntry = useAppStore((s) => (prCacheKey ? s.prCache?.[prCacheKey] : undefined))

  const hostedReview: HostedReviewInfo | null | undefined =
    hostedReviewEntry !== undefined ? hostedReviewEntry.data : undefined
  const linkedGitHubPR = worktree.linkedPR ?? null
  const linkedGitLabMR = worktree.linkedGitLabMR ?? null
  const linkedBitbucketPR = worktree.linkedBitbucketPR ?? null
  const linkedAzureDevOpsPR = worktree.linkedAzureDevOpsPR ?? null
  const linkedGiteaPR = worktree.linkedGiteaPR ?? null
  const hasNonGitHubLinkedReview =
    linkedGitLabMR !== null ||
    linkedBitbucketPR !== null ||
    linkedAzureDevOpsPR !== null ||
    linkedGiteaPR !== null
  const hasLinkedReview =
    linkedGitHubPR !== null ||
    linkedGitLabMR !== null ||
    linkedBitbucketPR !== null ||
    linkedAzureDevOpsPR !== null ||
    linkedGiteaPR !== null
  // Why: ChecksPanel can discover a branch PR before hosted-review metadata
  // warms, and transient older hosted-review misses can race with that cache.
  // A newer miss only yields to merged PR cache when the stored worktree head
  // proves the cached PR still describes the checked-out commit.
  const cachedBranchPR = prCacheEntry?.data
  const cachedBranchPRFetchedAt = prCacheEntry?.fetchedAt
  const cachedMergedBranchPRMatchesCurrentHead = isCachedMergedBranchPRCurrentForWorktree(
    cachedBranchPR,
    worktree
  )
  const cachedBranchFallbackGitHubPRNumber =
    linkedGitHubPR === null &&
    !hasNonGitHubLinkedReview &&
    cachedBranchPR?.number !== undefined &&
    (cachedBranchPR.state !== 'merged' || cachedMergedBranchPRMatchesCurrentHead)
      ? cachedBranchPR.number
      : null
  const cachedBranchPRCanDriveDisplay =
    cachedBranchPR?.state !== 'merged' || cachedMergedBranchPRMatchesCurrentHead
  const hostedReviewMatchesHeadMatchedCachedMergedPR =
    cachedMergedBranchPRMatchesCurrentHead &&
    cachedBranchPR !== null &&
    cachedBranchPR !== undefined &&
    hostedReview?.provider === 'github' &&
    hostedReview.number === cachedBranchPR.number
  const useCachedBranchReview =
    cachedBranchPR !== undefined &&
    cachedBranchPR !== null &&
    !hasNonGitHubLinkedReview &&
    cachedBranchPRCanDriveDisplay &&
    (hostedReview === undefined ||
      (cachedMergedBranchPRMatchesCurrentHead && !hostedReviewMatchesHeadMatchedCachedMergedPR) ||
      (hostedReview === null &&
        ((cachedBranchPRFetchedAt !== undefined &&
          cachedBranchPRFetchedAt > (hostedReviewEntry?.fetchedAt ?? 0)) ||
          cachedMergedBranchPRMatchesCurrentHead)))
  const cachedBranchReview = useCachedBranchReview
    ? hostedReviewInfoFromGitHubPRInfo(cachedBranchPR)
    : hostedReview
  const prDisplay = getWorktreeCardPrDisplay(
    cachedBranchReview,
    linkedGitHubPR,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR,
    {
      reviewHintKey:
        (useCachedBranchReview || cachedMergedBranchPRMatchesCurrentHead) && !hasLinkedReview
          ? ''
          : hostedReviewEntry?.linkedReviewHintKey
    }
  )
  const cardTitleDisplay = getWorktreeCardTitleDisplay({
    storedDisplayName: worktree.displayName,
    branchName: branch,
    reviewTitle: prDisplay?.title
  })
  const visibleCardTitle = cardTitleDisplay
  const isDeleting = deleteState?.isDeleting ?? false
  const isQueuedForDeletion = deleteState?.phase === 'queued'
  const deleteLabel = isQueuedForDeletion
    ? translate('auto.components.sidebar.WorktreeCard.ef18787206', 'Queued for deletion')
    : translate('auto.components.sidebar.WorktreeCard.691ccfd622', 'Deleting…')
  const deleteModifierPressed = useWorkspaceDeleteModifierPressed()

  const showStatus = cardProps.includes('status')
  const showAutomation = cardProps.includes('automation')
  const showComment = cardProps.includes('comment')
  const showPorts = cardProps.includes('ports')
  const shouldRefreshHostedReview = showStatus
  const detailsHoverControl = useWorktreeCardDetailsHoverControl()
  const hoverDetailsOpen = detailsHoverControl.hoverOpen

  // Skip hosted-review fetches when the corresponding card surfaces are hidden.
  // This preference is purely presentational, so background refreshes would
  // spend rate limit budget on data the user cannot see.
  useEffect(() => {
    // Why: paired web should not fan out per-card decoration RPCs during
    // startup; host session/tab parity is the critical path.
    if (isWebClient()) {
      return
    }
    if (
      !repo ||
      isFolder ||
      worktree.isBare ||
      !hostedReviewCacheKey ||
      !shouldRefreshHostedReview ||
      isMacAppDataPath(repo.path)
    ) {
      return
    }
    const refreshHostedReview = (): void => {
      // Why: branch lookup is lossy for fork/deleted-head PRs; reuse a known PR
      // number from explicit metadata whenever we have one.
      void fetchHostedReviewForBranch(repo.path, branch, {
        repoId: repo.id,
        linkedGitHubPR: worktree.linkedPR ?? null,
        ...(cachedBranchFallbackGitHubPRNumber !== null
          ? { fallbackGitHubPR: cachedBranchFallbackGitHubPRNumber }
          : {}),
        currentHeadOid: worktree.head ?? null,
        linkedGitLabMR,
        linkedBitbucketPR,
        linkedAzureDevOpsPR,
        linkedGiteaPR,
        staleWhileRevalidate: true
      })
    }
    // Why: PRs created outside Yiru (for example `gh pr create`) do not emit a
    // renderer event; visible-card polling discovers them after an earlier miss.
    return installWindowVisibilityInterval({
      run: refreshHostedReview,
      intervalMs: HOSTED_REVIEW_CARD_REFRESH_INTERVAL_MS
    })
  }, [
    repo,
    isFolder,
    worktree.isBare,
    worktree.linkedPR,
    worktree.head,
    cachedBranchFallbackGitHubPRNumber,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR,
    fetchHostedReviewForBranch,
    branch,
    hostedReviewCacheKey,
    shouldRefreshHostedReview
  ])

  useEffect(() => {
    if (
      !hoverDetailsOpen ||
      shouldRefreshHostedReview ||
      isWebClient() ||
      !repo ||
      isFolder ||
      worktree.isBare ||
      !hostedReviewCacheKey ||
      isMacAppDataPath(repo.path)
    ) {
      return
    }
    // Why: hidden card metadata is revealed on whole-card hover. Fetch lazily
    // here instead of restoring always-on background decoration polling.
    void fetchHostedReviewForBranch(repo.path, branch, {
      repoId: repo.id,
      linkedGitHubPR: worktree.linkedPR ?? null,
      ...(cachedBranchFallbackGitHubPRNumber !== null
        ? { fallbackGitHubPR: cachedBranchFallbackGitHubPRNumber }
        : {}),
      currentHeadOid: worktree.head ?? null,
      linkedGitLabMR,
      linkedBitbucketPR,
      linkedAzureDevOpsPR,
      linkedGiteaPR,
      staleWhileRevalidate: true
    })
  }, [
    hoverDetailsOpen,
    shouldRefreshHostedReview,
    repo,
    isFolder,
    worktree.isBare,
    worktree.linkedPR,
    worktree.head,
    cachedBranchFallbackGitHubPRNumber,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR,
    fetchHostedReviewForBranch,
    branch,
    hostedReviewCacheKey
  ])

  // Stable click handler – ignore clicks that are really text selections.
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
        return
      }
      const selection = window.getSelection()
      // Why: only suppress the click when the selection is *inside this card*
      // (a real drag-select on the card's own text). A selection anchored
      // elsewhere — e.g. inside the markdown preview while the AI is streaming
      // writes — must not block worktree switching, otherwise the user can't
      // leave the current worktree without first clicking into a terminal to
      // clear the foreign selection.
      if (selection && selection.toString().length > 0) {
        const card = event.currentTarget
        const anchor = selection.anchorNode
        const focus = selection.focusNode
        const selectionInsideCard =
          (anchor instanceof Node && card.contains(anchor)) ||
          (focus instanceof Node && card.contains(focus))
        if (selectionInsideCard) {
          return
        }
      }
      const selectionOnly = affiliateListMode
        ? false
        : (onSelectionGesture?.(event, worktree.id) ?? false)
      if (selectionOnly) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (isDeleting) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // Why: route sidebar clicks through the shared activation path so the
      // back/forward stack stays complete for the primary worktree navigation
      // surface instead of only recording palette-driven switches.
      recordRendererCrashBreadcrumb('sidebar_worktree_activate', {
        worktreeId: worktree.id,
        repoId: worktree.repoId,
        wasActive: isActive,
        sshDisconnected: isSshDisconnected
      })
      onImmediateActivate?.(worktree.id, activationRowKey)
      void activateWorktreeFromSidebar(worktree.id)
      // Why: clicking the card is a deliberate focus of this project, so the
      // blocking reconnect prompt is appropriate here (unlike auto-restore) —
      // but skip it when a terminal is active, since that pane already shows the
      // in-context reconnect overlay and a second prompt would just duplicate it.
      if (isSshDisconnected && !activeViewIsTerminal) {
        setShowDisconnectedDialog(true)
      }
      onActivate?.()
    },
    [
      affiliateListMode,
      worktree.id,
      worktree.repoId,
      isActive,
      isDeleting,
      activationRowKey,
      isSshDisconnected,
      activeViewIsTerminal,
      onActivate,
      onImmediateActivate,
      onSelectionGesture
    ]
  )

  const handleRenameTitle = useCallback(
    (displayName: string) => updateWorktreeMeta(worktree.id, { displayName }),
    [updateWorktreeMeta, worktree.id]
  )

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (affiliateListMode) {
        return
      }
      if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
        return
      }
      openModal('edit-meta', {
        worktreeId: worktree.id,
        currentDisplayName: worktree.displayName,
        currentPR: worktree.linkedPR,
        currentComment: worktree.comment
      })
    },
    [
      openModal,
      affiliateListMode,
      worktree.comment,
      worktree.displayName,
      worktree.id,
      worktree.linkedPR
    ]
  )

  // Why: delete is destructive, so it only appears while the user is holding
  // Option/Alt instead of being part of the ordinary hover chrome.
  const showDeleteQuickAction =
    !affiliateListMode &&
    canShowWorkspaceDeleteQuickAction({
      deleteModifierPressed,
      isDeleting,
      isMainWorktree: worktree.isMainWorktree
    })
  const handleWorkspaceQuickAction = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (showDeleteQuickAction) {
        if (folderWorkspaceId) {
          void deleteFolderWorkspace(folderWorkspaceId).then((deleted) => {
            if (
              deleted &&
              useAppStore.getState().activeWorktreeId === folderWorkspaceKey(folderWorkspaceId)
            ) {
              setActiveWorktree(null)
            }
          })
          return
        }
        runWorktreeDelete(worktree.id)
      }
    },
    [
      deleteFolderWorkspace,
      folderWorkspaceId,
      setActiveWorktree,
      showDeleteQuickAction,
      worktree.id
    ]
  )
  const handleOpenRenameErrorDialog = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setShowRenameErrorDialog(true)
  }, [])
  const lineageChildAriaLabel =
    lineageChildCount === 1
      ? lineageCollapsed
        ? translate(
            'auto.components.sidebar.WorktreeList.20bebf9c7f',
            'Show {{value0}} child workspace',
            { value0: lineageChildCount }
          )
        : translate(
            'auto.components.sidebar.WorktreeList.e97297cb75',
            'Hide {{value0}} child workspace',
            { value0: lineageChildCount }
          )
      : lineageCollapsed
        ? translate(
            'auto.components.sidebar.WorktreeList.c1f4a31623',
            'Show {{value0}} child workspaces',
            { value0: lineageChildCount }
          )
        : translate(
            'auto.components.sidebar.WorktreeList.0cd15956d4',
            'Hide {{value0}} child workspaces',
            { value0: lineageChildCount }
          )
  const childWorkspaceShortLabel = `${lineageChildCount} ${
    lineageChildCount === 1
      ? translate('auto.components.sidebar.WorktreeList.0c6ee14f23', 'child')
      : translate('auto.components.sidebar.WorktreeList.045a8aed48', 'children')
  }`
  const showLineageChildChip = lineageChildCount > 0 && onLineageToggle !== undefined

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
        event.preventDefault()
        return
      }
      if (isDeleting) {
        event.preventDefault()
        return
      }
      const dragIds =
        isMultiSelected && selectedWorktrees && selectedWorktrees.length > 1
          ? selectedWorktrees.map((item) => item.id)
          : worktree.id
      writeWorkspaceDragData(event.dataTransfer, dragIds)
      onCardDragStart?.(event, worktree.id, Array.isArray(dragIds) ? dragIds : [dragIds])
    },
    [isDeleting, isMultiSelected, onCardDragStart, selectedWorktrees, worktree.id]
  )

  const handleDragEnd = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
        return
      }
      onCardDragEnd?.(event)
    },
    [onCardDragEnd]
  )

  const handleContextMenuSelect = useCallback(
    (event: React.MouseEvent<HTMLElement>) => onContextMenuSelect?.(event, worktree) ?? [worktree],
    [onContextMenuSelect, worktree]
  )

  const stopQuickActionPointerPropagation = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      // Why: quick card actions mutate metadata but must not activate the card
      // through document-level pointer handling.
      event.stopPropagation()
    },
    []
  )

  // Why: unread is part of the left status lane, so the Status display toggle
  // owns both the dot/PR slot and unread emphasis. The persisted
  // `worktree.isUnread` flag is unchanged; only the rendering changes.
  const showUnreadEmphasis = showStatus && worktree.isUnread
  const hoverReview = prDisplay
  const statusLaneReview = statusPrDisplay ?? hoverReview
  const hoverComment = worktree.comment
  const metaAutomationProvenance = showAutomation ? worktree.automationProvenance : null
  const metaComment = showComment ? hoverComment : null
  const showInlineAgentList = cardProps.includes('inline-agents')
  const compactInlineAgentRows = useWorktreeAgentRows(
    worktree.id,
    showInlineAgentList && agentActivityDisplayMode === 'compact'
  )
  const compactInlineAgentRowsVisible =
    showInlineAgentList &&
    agentActivityDisplayMode === 'compact' &&
    compactInlineAgentRows.length > 0
  const showAggregateCacheTimer = !compactInlineAgentRowsVisible
  const hasExplicitLinkedReview =
    (hoverReview?.provider === 'github' && worktree.linkedPR !== null) ||
    (hoverReview?.provider === 'gitlab' && linkedGitLabMR !== null) ||
    (hoverReview?.provider === 'bitbucket' && linkedBitbucketPR !== null) ||
    (hoverReview?.provider === 'azure-devops' && linkedAzureDevOpsPR !== null) ||
    (hoverReview?.provider === 'gitea' && linkedGiteaPR !== null)
  const handleUnlinkReview = useCallback(() => {
    switch (hoverReview?.provider) {
      case 'github':
        void updateWorktreeMeta(worktree.id, { linkedPR: null })
        return
      case 'gitlab':
        void updateWorktreeMeta(worktree.id, { linkedGitLabMR: null })
        return
      case 'bitbucket':
        void updateWorktreeMeta(worktree.id, { linkedBitbucketPR: null })
        return
      case 'azure-devops':
        void updateWorktreeMeta(worktree.id, { linkedAzureDevOpsPR: null })
        return
      case 'gitea':
        void updateWorktreeMeta(worktree.id, { linkedGiteaPR: null })
        return
      case 'unsupported':
      case undefined:
        break
    }
  }, [hoverReview?.provider, updateWorktreeMeta, worktree.id])
  const hasDetails = hasWorktreeCardDetails({
    review: null,
    comment: metaComment,
    automationProvenance: metaAutomationProvenance
  })
  const hasPorts = showPorts && workspacePorts.length > 0
  const cacheStartedAt = usePromptCacheCountdownStartedAt(worktree.id, showAggregateCacheTimer)
  const cacheTtlMs = useAppStore((s) =>
    showAggregateCacheTimer ? (s.settings?.promptCacheTtlMs ?? 0) : 0
  )
  // Why: pinned trees mix repos in one section; a leading repo icon keeps the
  // list scannable, so it shows regardless of groupBy's hideRepoBadge.
  const showPinnedRepoIcon = inPinnedSection && !!repo
  // Why: repo identity uses the same compact chip as pinned cards so the title
  // and metadata rows keep one stable alignment.
  const showInlineRepoBadge = !!repo && !hideRepoBadge && !isFolder && !showPinnedRepoIcon
  const showHostContextBadge = !!hostContextLabel
  const showDetachedHeadInMetaRow = !isFolder && detachedHeadDisplay !== null
  // Why: rebases already surface in source control; keep dense cards from
  // carrying a persistent rebase chip while preserving other interruption cues.
  const showConflictOperationBadge =
    !!conflictOperation && conflictOperation !== 'unknown' && conflictOperation !== 'rebase'
  // Why: unread is represented by the passive status-lane overlay; changing
  // read state remains available from the card context menu.
  const showCombinedStatusSlot = showStatus
  const showTitleRowIndicators = hasDetails || hasPorts
  const hasMetaRow = Boolean(
    showHostContextBadge ||
    showIdentity ||
    showDetachedHeadInMetaRow ||
    showConflictOperationBadge ||
    cacheStartedAt != null
  )
  const showHeaderActions = showDeleteQuickAction
  // Why: the hover owns full identity when the row truncates; normalize once
  // so title/branch de-dupe and identity-only hover eligibility stay in sync.
  const trimmedVisibleCardTitle = visibleCardTitle.trim()
  const hoverBranchName = identityDisplay
  const hoverWorkspaceTitle =
    trimmedVisibleCardTitle.length > 0 && trimmedVisibleCardTitle !== hoverBranchName
      ? trimmedVisibleCardTitle
      : undefined
  const hasHoverIdentity = Boolean(hoverWorkspaceTitle || hoverBranchName)
  const hasHoverDetails =
    hasWorktreeCardDetails({
      review: hoverReview,
      comment: hoverComment,
      automationProvenance: metaAutomationProvenance
    }) ||
    workspacePorts.length > 0 ||
    hasHoverIdentity
  // Why: the parent row owns metadata hover; avoid stacking the title's
  // truncation tooltip on top of the richer details popover.
  const titleWrapper = hasHoverDetails
    ? (title: React.ReactElement): React.ReactElement => title
    : undefined
  // Why: sidebar rows need a small surface inset, while their content remains
  // aligned with the pre-inset layout and the repo header hierarchy.
  const applyStatusLaneOffset = showCombinedStatusSlot
  const cardPaddingLeft = flushSurface
    ? getFlushWorktreeCardPaddingLeft(contentIndent, applyStatusLaneOffset)
    : contentIndent > 0
      ? `calc(0.125rem + ${contentIndent}px)`
      : null
  const parentContentMarginLeft =
    flushSurface && applyStatusLaneOffset
      ? getWorktreeCardParentContentMarginLeft(contentIndent)
      : 0
  const cardStyle = cardPaddingLeft ? { paddingLeft: cardPaddingLeft } : undefined
  const detailsAndPortsContent =
    hasDetails || hasPorts ? (
      <div className="flex shrink-0 items-center gap-1">
        {hasPorts && <WorktreeCardPortsTrigger ports={workspacePorts} />}
        {hasDetails && (
          <WorktreeCardMetaBadges
            review={null}
            comment={metaComment}
            automationProvenance={metaAutomationProvenance}
            className="ml-0 pr-0"
          />
        )}
      </div>
    ) : null
  const titleRowIndicators = showTitleRowIndicators ? (
    <div className="ml-auto flex shrink-0 items-center gap-1 pr-1.5">{detailsAndPortsContent}</div>
  ) : null
  const hasSecondaryCardContent =
    hasMetaRow ||
    !!remoteBranchConflict ||
    spoolControlGrants.length > 0 ||
    showInlineAgentList ||
    showLineageChildChip
  const titleOnlyCard = !hasSecondaryCardContent

  const parentCardContent = (
    <div
      className={cn(
        'flex w-full min-w-0 gap-0.5 pl-0',
        titleOnlyCard ? 'items-center' : 'items-start'
      )}
      style={
        parentContentMarginLeft < 0 ? { marginLeft: `${parentContentMarginLeft}px` } : undefined
      }
      data-worktree-card-parent-content=""
    >
      {showCombinedStatusSlot ? (
        <div
          className={cn(
            'mr-1 flex w-5 shrink-0 items-center justify-center',
            affiliateListMode && 'px-1'
          )}
          data-worktree-card-status-slot=""
        >
          <WorktreeCardStatusSlot
            worktreeId={worktree.id}
            showStatus={showStatus}
            isUnread={worktree.isUnread}
            prDisplay={statusLaneReview}
            hasBranchIdentity={Boolean(branchIdentityDisplay)}
          />
        </div>
      ) : null}

      {/* Content area */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-1.5',
          // Why: inline agent rows intentionally outdent into the card gutter;
          // title/meta truncation is handled by their own inner elements.
          showInlineAgentList ? 'overflow-visible' : 'overflow-hidden'
        )}
      >
        {/* Header row: Title */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {showPinnedRepoIcon && (
              <RepoIdentityChip repo={repo}>
                <RepoIconGlyph
                  repoIcon={repo.repoIcon}
                  color={resolveRepoHeaderColor(repo.badgeColor)}
                  className="size-full"
                  iconClassName="size-3"
                />
              </RepoIdentityChip>
            )}

            {repo?.connectionId && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex shrink-0 items-center">
                      {isSshDisconnected ? (
                        <ServerOff className="size-3 text-red-400" />
                      ) : (
                        <Server className="text-muted-foreground size-3" />
                      )}
                    </span>
                  }
                />
                <TooltipContent side="right" sideOffset={8}>
                  {isSshDisconnected
                    ? translate(
                        'auto.components.sidebar.WorktreeCard.021538e1d1',
                        'SSH disconnected'
                      )
                    : translate(
                        'auto.components.sidebar.WorktreeCard.ca74db7550',
                        'Project on SSH host'
                      )}
                </TooltipContent>
              </Tooltip>
            )}

            {!repo?.connectionId &&
              parseExecutionHostId(repo?.executionHostId)?.kind === 'runtime' && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex shrink-0 items-center">
                        {isRuntimeDisconnected ? (
                          <ServerOff className="size-3 text-red-400" />
                        ) : (
                          <Server className="text-muted-foreground size-3" />
                        )}
                      </span>
                    }
                  />
                  <TooltipContent side="right" sideOffset={8}>
                    {isRuntimeDisconnected
                      ? translate(
                          'auto.components.sidebar.WorktreeCard.runtimeHostDisconnected',
                          'Server disconnected'
                        )
                      : translate(
                          'auto.components.sidebar.WorktreeCard.runtimeHostProject',
                          'Project on Yiru server'
                        )}
                  </TooltipContent>
                </Tooltip>
              )}

            {showInlineRepoBadge && (
              <RepoIdentityChip repo={repo}>
                <RepoIconGlyph
                  repoIcon={repo.repoIcon}
                  color={resolveRepoHeaderColor(repo.badgeColor)}
                  className="size-full"
                  iconClassName="size-3"
                />
              </RepoIdentityChip>
            )}

            {/* Why: unread alert lives in the left status lane; weight plus dimmed
                 read titles carry scan contrast in the title row. */}
            <WorktreeTitleInlineRename
              displayName={visibleCardTitle}
              disabled={isDeleting || affiliateListMode}
              showUnreadEmphasis={showUnreadEmphasis}
              dimReadTitle
              className="text-[13px] leading-5"
              editingClassName="flex-1"
              titleWrapper={titleWrapper}
              onEditingChange={affiliateListMode ? undefined : setTitleRenaming}
              onRename={handleRenameTitle}
              beginEditing={
                !affiliateListMode &&
                shouldBeginWorktreeRename(renamingWorktreeId, worktree.id, renameRowKey)
              }
              onBeginEditingConsumed={
                affiliateListMode ? undefined : () => setRenamingWorktreeId(null)
              }
            />

            {typeof worktree.firstAgentMessageRenameError === 'string' &&
            worktree.firstAgentMessageRenameError.length > 0 &&
            !titleRenaming ? (
              // The full error can be raw agent CLI output, so the title-row
              // badge opens a dialog instead of squeezing details into a tooltip.
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      onPointerDown={stopQuickActionPointerPropagation}
                      onClick={handleOpenRenameErrorDialog}
                      onDoubleClick={handleOpenRenameErrorDialog}
                      className="text-destructive border-destructive/40 bg-destructive/10 hover:bg-destructive/15 hover:text-destructive h-4 shrink-0 gap-0.5 rounded border !px-0.5 text-[10px] leading-none font-medium has-[>svg]:!px-0.5"
                      aria-label={translate(
                        'auto.components.sidebar.WorktreeCard.02e19349f4',
                        'Auto-rename failed: view error'
                      )}
                    >
                      <AlertCircle className="size-2.5" />
                      {translate(
                        'auto.components.sidebar.WorktreeCard.74522ee457',
                        'rename failed'
                      )}
                    </Button>
                  }
                />
                <TooltipContent side="right" sideOffset={8}>
                  {translate(
                    'auto.components.sidebar.WorktreeCard.4eba2ea99e',
                    'Auto-name failed. Click to see details.'
                  )}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {worktree.isMainWorktree && !isFolder && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      variant="outline"
                      className="text-foreground/70 border-foreground/20 bg-foreground/[0.06] h-[16px] shrink-0 rounded px-1.5 text-[10px] leading-none font-medium"
                    >
                      {translate('auto.components.sidebar.WorktreeCard.7d517f82e2', 'primary')}
                    </Badge>
                  }
                />
                <TooltipContent side="right" sideOffset={8}>
                  {translate(
                    'auto.components.sidebar.WorktreeCard.0777de5970',
                    'Primary worktree (original clone directory)'
                  )}
                </TooltipContent>
              </Tooltip>
            )}

            {worktree.isSparse && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      variant="outline"
                      className="h-[16px] shrink-0 rounded border-amber-500/30 bg-amber-500/5 px-1.5 text-[10px] leading-none font-medium text-amber-700 dark:text-amber-300"
                    >
                      {translate('auto.components.sidebar.WorktreeCard.4f964d5e8c', 'sparse')}
                    </Badge>
                  }
                />
                <TooltipContent side="right" sideOffset={8} className="max-w-72">
                  <div className="space-y-1">
                    <div>
                      {translate(
                        'auto.components.sidebar.WorktreeCard.0f33af979b',
                        'Partial checkout. Files outside these paths are not on disk.'
                      )}
                    </div>
                    {worktree.sparseDirectories && worktree.sparseDirectories.length > 0 ? (
                      <div className="font-mono text-[11px] opacity-80">
                        {formatSparseDirectoryPreview(worktree.sparseDirectories)}
                      </div>
                    ) : null}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {showTitleRowIndicators && titleRowIndicators}
          </div>

          {showHeaderActions && (
            <div className="ml-auto flex shrink-0 items-center justify-center gap-1 pr-1.5">
              {showDeleteQuickAction && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onPointerDown={stopQuickActionPointerPropagation}
                        onClick={handleWorkspaceQuickAction}
                        className={cn(
                          'outline-none',
                          'inline-flex size-4 items-center justify-center rounded bg-transparent opacity-0 transition-colors transition-opacity',
                          'group-hover/worktree-card:opacity-100 group-focus-within/worktree-card:opacity-100 focus-visible:opacity-100',
                          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive'
                        )}
                        aria-label={translate(
                          'auto.components.sidebar.WorktreeCard.6f09f58541',
                          'Delete workspace'
                        )}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    }
                  />
                  <TooltipContent side="right" sideOffset={8}>
                    {translate(
                      'auto.components.sidebar.WorktreeCard.6f09f58541',
                      'Delete workspace'
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {hasMetaRow && (
          <div className="flex min-w-0 items-center gap-1.5" data-worktree-card-meta-row="">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {showHostContextBadge && (
                <Badge
                  variant="secondary"
                  className="border-border bg-accent text-muted-foreground dark:bg-accent/80 dark:border-border/50 h-[16px] max-w-[7rem] shrink-0 rounded border px-1.5 text-[10px] leading-none font-medium"
                >
                  <span className="truncate">{hostContextLabel}</span>
                </Badge>
              )}

              {showIdentity ? (
                <TruncatedSidebarLabel
                  text={identityDisplay!}
                  className="text-muted-foreground text-[11px] leading-none"
                  tooltipEnabled={!hasHoverDetails}
                />
              ) : showDetachedHeadInMetaRow && detachedHeadDisplay ? (
                <DetachedHeadBadge
                  display={detachedHeadDisplay}
                  label="sidebar"
                  side="right"
                  className="h-[16px]"
                />
              ) : null}

              {showConflictOperationBadge && (
                <Badge
                  variant="outline"
                  className="h-[16px] shrink-0 gap-1 rounded border-amber-500/30 bg-amber-500/5 px-1.5 text-[10px] leading-none font-medium text-amber-600 dark:border-amber-400/30 dark:bg-amber-400/5 dark:text-amber-400"
                >
                  <GitMerge className="size-2.5" />
                  {CONFLICT_OPERATION_LABELS[conflictOperation]}
                </Badge>
              )}

              {cacheStartedAt != null && (
                <CacheTimer startedAt={cacheStartedAt} ttlMs={cacheTtlMs} />
              )}
            </div>
          </div>
        )}

        {remoteBranchConflict && (
          <div className="mt-0.5 flex items-start gap-1.5 rounded border border-amber-500/25 bg-amber-500/5 px-1.5 py-1 text-[10.5px] leading-snug text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-[1px] size-3 shrink-0" />
            <span className="min-w-0 flex-1">
              {translate(
                'auto.components.sidebar.WorktreeCard.a88c92d0e3',
                '{{value0}}/{{value1}} already exists.',
                {
                  value0: remoteBranchConflict.remote,
                  value1: remoteBranchConflict.branchName
                }
              )}
            </span>
          </div>
        )}

        {spoolControlGrants.length > 0 && onRevokeSpoolControlGrant ? (
          <WorktreeCardControlGrants
            grants={spoolControlGrants}
            revokingGrantIds={spoolRevokingGrantIds}
            onRevoke={onRevokeSpoolControlGrant}
          />
        ) : null}

        {/* Why: inline agent list. Gated on the 'inline-agents' card
             property so users can hide it. Layout coupling: this block
             grows the card height dynamically — WorktreeList uses
             measureElement on each row, so the virtualizer re-measures
             naturally when agents appear/disappear. When agents directly
             follow the title, counterbalance the card stack gap so both rows
             read as one compact header group. */}
        {showInlineAgentList && (
          <WorktreeCardAgents
            worktreeId={worktree.id}
            agents={agentActivityDisplayMode === 'compact' ? compactInlineAgentRows : undefined}
            className={
              hasMetaRow || remoteBranchConflict || spoolControlGrants.length > 0 ? 'mt-0' : '-mt-1'
            }
          />
        )}

        {showLineageChildChip && (
          <div
            className="relative mt-1 flex min-w-0 justify-start"
            style={{
              color: 'color-mix(in srgb, var(--muted-foreground) 42%, var(--sidebar))'
            }}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="border-sidebar-border bg-sidebar text-muted-foreground hover:bg-sidebar-accent hover:text-foreground relative z-10 h-[18px] max-w-[8rem] gap-1 rounded-md border px-1.5 text-[10px] leading-none font-medium"
                    aria-label={lineageChildAriaLabel}
                    aria-expanded={!lineageCollapsed}
                    onClick={onLineageToggle}
                  >
                    <Workflow className="size-2.5" />
                    <span className="truncate">{childWorkspaceShortLabel}</span>
                    <ChevronDown
                      className={cn(
                        'size-2.5 transition-transform',
                        lineageCollapsed && '-rotate-90'
                      )}
                    />
                  </Button>
                }
              />
              <TooltipContent side="right" sideOffset={8}>
                {lineageCollapsed
                  ? translate(
                      'auto.components.sidebar.WorktreeCard.8cb634cda6',
                      'Show child workspaces'
                    )
                  : translate(
                      'auto.components.sidebar.WorktreeCard.57eaa61b55',
                      'Hide child workspaces'
                    )}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  )

  const parentHoverTriggerBody = (
    <div className="group/worktree-card w-full min-w-0" data-worktree-card-hover-trigger="">
      {parentCardContent}
    </div>
  )

  const parentCardBodyWithHoverDetails =
    hasHoverDetails && !titleRenaming ? (
      <WorktreeCardDetailsHover
        review={hoverReview}
        comment={hoverComment}
        automationProvenance={metaAutomationProvenance}
        automationHostId={worktree.hostId}
        branchName={hoverBranchName}
        workspaceTitle={hoverWorkspaceTitle}
        workspaceTitleRenameDisabled={isDeleting || affiliateListMode}
        detailsAfter={
          workspacePorts.length > 0 ? <WorktreeCardPortsDetails ports={workspacePorts} /> : null
        }
        openDelay={100}
        hoverControl={detailsHoverControl}
        onRenameWorkspaceTitle={affiliateListMode ? undefined : handleRenameTitle}
        onEditComment={affiliateListMode ? undefined : handleEditComment}
        onOpenAutomation={affiliateListMode ? undefined : handleOpenAutomation}
        onOpenAutomationRun={affiliateListMode ? undefined : handleOpenAutomationRun}
        // Why: branch lookup can show a review without persisted metadata. Only
        // expose unlink when this workspace has an explicit linked PR/MR.
        onUnlinkReview={
          !affiliateListMode && hasExplicitLinkedReview ? handleUnlinkReview : undefined
        }
      >
        {parentHoverTriggerBody}
      </WorktreeCardDetailsHover>
    ) : (
      parentHoverTriggerBody
    )

  const cardBody = (
    <WorktreeCardSurface
      density={titleOnlyCard ? 'title-only' : 'details'}
      flush={flushSurface}
      activeVariant={isActiveSurface ? activeSurfaceVariant : undefined}
      multiSelected={isMultiSelected}
      dropTarget={isLineageDropTarget}
      className={cn(
        revealHighlight && [
          'scroll-to-current-workspace-reveal-highlight',
          revealHighlightTone === 'ai' && 'scroll-to-current-workspace-reveal-highlight--ai'
        ],
        titleRenaming && '!border-transparent !bg-transparent    ',
        isDeleting && 'opacity-50 grayscale cursor-not-allowed',
        (isSshDisconnected || isRuntimeDisconnected) && !isDeleting && 'opacity-60'
      )}
      onClick={handleClick}
      onDoubleClick={affiliateListMode ? undefined : handleDoubleClick}
      draggable={!affiliateListMode && nativeDragEnabled && !isDeleting && !titleRenaming}
      onDragStart={!affiliateListMode && nativeDragEnabled ? handleDragStart : undefined}
      onDragEnd={!affiliateListMode && nativeDragEnabled ? handleDragEnd : undefined}
      aria-busy={isDeleting}
      style={cardStyle}
    >
      {isDeleting && (
        <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
          <div className="bg-background text-foreground border-border/50 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium">
            {!isQueuedForDeletion ? (
              <LoadingIndicator className="text-muted-foreground size-3.5" />
            ) : null}
            {deleteLabel}
          </div>
        </div>
      )}
      {parentCardBodyWithHoverDetails}

      {lineageChildren ? (
        <div
          className="mt-1.5 space-y-1"
          data-worktree-lineage-children=""
          style={lineageChildrenStyle}
        >
          {lineageChildren}
        </div>
      ) : null}
    </WorktreeCardSurface>
  )

  return (
    <>
      {affiliateListMode ? (
        cardBody
      ) : (
        <WorktreeContextMenu
          worktree={worktree}
          selectedWorktrees={selectedWorktrees}
          onContextMenuSelect={handleContextMenuSelect}
        >
          {cardBody}
        </WorktreeContextMenu>
      )}

      {repo?.connectionId && (
        <SshDisconnectedDialog
          open={showDisconnectedDialog && isSshDisconnected}
          onOpenChange={setShowDisconnectedDialog}
          targetId={repo.connectionId}
          targetLabel={sshTargetLabel || repo.displayName}
          status={sshStatus ?? 'disconnected'}
        />
      )}

      {typeof worktree.firstAgentMessageRenameError === 'string' &&
        worktree.firstAgentMessageRenameError.length > 0 && (
          <AutoRenameFailedDialog
            open={showRenameErrorDialog}
            onOpenChange={setShowRenameErrorDialog}
            worktreeId={worktree.id}
            worktreeName={worktree.displayName}
            error={worktree.firstAgentMessageRenameError}
          />
        )}
    </>
  )
})

export default WorktreeCard
