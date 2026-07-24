import { useCallback, useEffect, useRef, useState } from 'react'

import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { getConnectionId } from '@/lib/connection-context'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { loadSessionCommitDrafts } from '@/lib/source-control-commit-draft-session'
import { resolveSourceControlLaunchPlatform } from '@/lib/source-control-launch-platform'
import { useAppStore } from '@/store'
import {
  getCommitMessageGenerationRecordKey,
  type CommitMessageGenerationRecord
} from '@/store/slices/commit-message-generation'
import {
  getPullRequestGenerationRecordKey,
  getPullRequestGenerationSeedRestoreKey
} from '@/store/slices/pull-request-generation'

import { isFolderRepo } from '../../../../shared/repo-kind'
import type { GitConflictOperation } from '../../../../shared/types'
import type { GitHistoryPanelState } from './git-history-panel'
import type { SourceControlActionError } from './source-control-action-error'
import type { SourceControlStoreStateController } from './source-control-controller-store-state'
import {
  createPrIntentCurrentTargetConflictsWithToken,
  type CreatePrIntentRunToken
} from './source-control-create-pr-intent-flow'
import type { PendingDiscardConfirmation } from './source-control-discard-dialog'
import {
  EMPTY_GIT_HISTORY_STATE,
  createDefaultCollapsedSections
} from './source-control-panel-constants'
import {
  normalizeSourceControlViewMode,
  readCommitDraftForWorktree,
  type CommitDraftsByWorktree
} from './source-control-panel-state'
import type {
  CreatePrIntentNotice,
  HostedReviewCreationProviderHint,
  HostedReviewCreationRequestState,
  HostedReviewCreationState,
  SourceControlOperationTarget
} from './source-control-panel-types'
import { resolveSourceControlGroupOrder } from './source-control-section-order'
import { useSourceControlSubmoduleStatus } from './use-source-control-submodule-status'

export function useSourceControlInteractionState(scope: SourceControlStoreStateController) {
  const {
    activeRepo,
    activeRepoSettings,
    activeWorktree,
    activeWorktreeId,
    branchName,
    entries,
    isVisible,
    settings,
    worktreeMap
  } = scope
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    createDefaultCollapsedSections
  )
  const persistedSourceControlViewMode = normalizeSourceControlViewMode(
    settings?.sourceControlViewMode
  )
  const sourceControlViewMode = persistedSourceControlViewMode
  const sourceControlGroupOrder = resolveSourceControlGroupOrder(settings?.sourceControlGroupOrder)
  const [collapsedTreeDirs, setCollapsedTreeDirs] = useState<Set<string>>(new Set())
  const [baseRefDialogOpen, setBaseRefDialogOpen] = useState(false)
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscardConfirmation | null>(null)
  const [defaultBaseRef, setDefaultBaseRef] = useState<string | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [commitDrafts, setCommitDrafts] = useState<CommitDraftsByWorktree>(() =>
    loadSessionCommitDrafts()
  )
  const commitDraftsRef = useRef<CommitDraftsByWorktree>(commitDrafts)
  const commitErrorsRef = useRef<Record<string, string | null>>({})
  const [commitErrors, setCommitErrors] = useState<Record<string, string | null>>({})
  const [remoteActionErrors, setRemoteActionErrors] = useState<
    Record<string, SourceControlActionError | null>
  >({})
  const remoteActionErrorSequenceByWorktreeRef = useRef<Record<string, number>>({})
  const previousConflictOperationsRef = useRef<Record<string, GitConflictOperation>>({})
  const [commitInFlightByWorktree, setCommitInFlightByWorktree] = useState<Record<string, boolean>>(
    {}
  )
  const [abortOperationInFlightByWorktree, setAbortOperationInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const isAbortingOperation = abortOperationInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const confirmAction = useConfirmationDialog()
  const isCommitting = commitInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const generateInFlightRef = useRef<Record<string, boolean>>({})
  const [generateInFlightByWorktree, setGenerateInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const [generateErrors, setGenerateErrors] = useState<Record<string, string | null>>({})
  const [hostedReviewCreationState, setHostedReviewCreationState] =
    useState<HostedReviewCreationState | null>(null)
  const [hostedReviewCreationRequestState, setHostedReviewCreationRequestState] =
    useState<HostedReviewCreationRequestState | null>(null)
  const hostedReviewCreationProviderHintRef = useRef<HostedReviewCreationProviderHint>({
    repoId: null,
    worktreeId: null,
    branch: '',
    provider: 'github'
  })
  const createPrInFlightRef = useRef<Record<string, boolean>>({})
  const [createPrInFlightByWorktree, setCreatePrInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const isCreatingPr = createPrInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const createPrIntentInFlightRef = useRef<Record<string, boolean>>({})
  const createPrIntentRunTokenRef = useRef<Record<string, CreatePrIntentRunToken | null>>({})
  const createPrIntentCurrentTargetRef = useRef({
    repoId: null as string | null,
    worktreeId: null as string | null,
    worktreePath: null as string | null,
    branch: null as string | null,
    baseRef: null as string | null
  })
  const [createPrIntentInFlightByWorktree, setCreatePrIntentInFlightByWorktree] = useState<
    Record<string, boolean>
  >({})
  const [createPrIntentNotices, setCreatePrIntentNotices] = useState<
    Record<string, CreatePrIntentNotice | null>
  >({})
  const isCreatePrIntentInFlight = createPrIntentInFlightByWorktree[activeWorktreeId ?? ''] ?? false
  const createPrIntentNotice = createPrIntentNotices[activeWorktreeId ?? ''] ?? null
  const setCreatePrIntentNoticeForWorktree = useCallback(
    (worktreeId: string, notice: CreatePrIntentNotice | null): void => {
      setCreatePrIntentNotices((prev) => ({ ...prev, [worktreeId]: notice }))
    },
    []
  )
  const createPrIntentRunStillOwnsWorktree = useCallback(
    (token: CreatePrIntentRunToken): boolean =>
      createPrIntentRunTokenRef.current[token.worktreeId] === token,
    []
  )
  const createPrIntentActiveTargetConflicts = useCallback(
    (token: CreatePrIntentRunToken): boolean =>
      createPrIntentCurrentTargetConflictsWithToken(token, createPrIntentCurrentTargetRef.current),
    []
  )
  const getCreatePrIntentOperationTarget = useCallback(
    (token: CreatePrIntentRunToken): SourceControlOperationTarget => ({
      // Why: Create PR intent continues after navigation; keep git commands
      // pinned to the worktree and runtime host that started the sequence.
      settings: activeRepoSettings,
      worktreeId: token.worktreeId,
      worktreePath: token.worktreePath,
      connectionId: getConnectionId(token.worktreeId) ?? undefined,
      pushTarget: worktreeMap.get(token.worktreeId)?.pushTarget
    }),
    [activeRepoSettings, worktreeMap]
  )
  const prGenerationRecords = useAppStore((s) => s.pullRequestGenerationRecords)
  const allocatePullRequestGenerationRequestId = useAppStore(
    (s) => s.allocatePullRequestGenerationRequestId
  )
  const setPullRequestGenerationRecord = useAppStore((s) => s.setPullRequestGenerationRecord)
  const updatePullRequestGenerationRecord = useAppStore((s) => s.updatePullRequestGenerationRecord)
  const commitMessageGenerationRecords = useAppStore((s) => s.commitMessageGenerationRecords)
  const allocateCommitMessageGenerationRequestId = useAppStore(
    (s) => s.allocateCommitMessageGenerationRequestId
  )
  const setCommitMessageGenerationRecord = useAppStore((s) => s.setCommitMessageGenerationRecord)
  const updateCommitMessageGenerationRecord = useAppStore(
    (s) => s.updateCommitMessageGenerationRecord
  )
  const commitMessage = readCommitDraftForWorktree(commitDrafts, activeWorktreeId)
  const commitError = commitErrors[activeWorktreeId ?? ''] ?? null
  const remoteActionError = remoteActionErrors[activeWorktreeId ?? ''] ?? null
  const activeRemoteActionSequence = activeWorktreeId
    ? (remoteActionErrorSequenceByWorktreeRef.current[activeWorktreeId] ?? null)
    : null
  const [gitHistoryByWorktree, setGitHistoryByWorktree] = useState<
    Record<string, GitHistoryPanelState>
  >({})
  const gitHistoryRequestSeqRef = useRef(0)
  const gitHistoryRequestByWorktreeRef = useRef<Record<string, number>>({})
  const gitHistoryState = activeWorktreeId
    ? (gitHistoryByWorktree[activeWorktreeId] ?? EMPTY_GIT_HISTORY_STATE)
    : EMPTY_GIT_HISTORY_STATE
  const isGitHistoryExpanded = !collapsedSections.has('history')
  useEffect(() => {
    commitDraftsRef.current = commitDrafts
  }, [commitDrafts])
  const updateCommitDrafts = useCallback(
    (updater: (drafts: CommitDraftsByWorktree) => CommitDraftsByWorktree): void => {
      const next = updater(commitDraftsRef.current)
      // Why: Create PR intent reads this ref after awaits to avoid overwriting
      // user edits made before React's passive state sync effect runs.
      commitDraftsRef.current = next
      setCommitDrafts(next)
    },
    []
  )
  const setCommitErrorForWorktree = useCallback(
    (worktreeId: string, message: string | null): void => {
      commitErrorsRef.current = { ...commitErrorsRef.current, [worktreeId]: message }
      setCommitErrors((prev) => ({ ...prev, [worktreeId]: message }))
    },
    []
  )
  const isFolder = activeRepo ? isFolderRepo(activeRepo) : false
  const worktreePath = activeWorktree?.path ?? null
  const { expandedSubmoduleKeys, submoduleStatusByKey, toggleSubmodule } =
    useSourceControlSubmoduleStatus({
      activeWorktreeId,
      worktreePath,
      activeRepoSettings,
      entries
    })
  const activeCommitMessageGenerationKey = getCommitMessageGenerationRecordKey(
    activeWorktreeId,
    worktreePath
  )
  const activeCommitMessageGenerationRecord: CommitMessageGenerationRecord | null =
    activeCommitMessageGenerationKey
      ? (commitMessageGenerationRecords[activeCommitMessageGenerationKey] ?? null)
      : null
  const isGenerating =
    activeCommitMessageGenerationRecord?.status === 'running' ||
    (generateInFlightByWorktree[activeWorktreeId ?? ''] ?? false)
  const generateError =
    activeCommitMessageGenerationRecord?.error ?? generateErrors[activeWorktreeId ?? ''] ?? null
  const activeConnectionId = activeWorktreeId
    ? (getConnectionId(activeWorktreeId) ?? activeRepo?.connectionId ?? null)
    : null
  const activeSourceControlLaunchPlatform = resolveSourceControlLaunchPlatform({
    connectionId: activeConnectionId,
    worktreePath,
    projectRuntime: activeConnectionId
      ? undefined
      : getLocalProjectExecutionRuntimeContext(useAppStore.getState(), activeWorktreeId)
  })
  const activePullRequestGenerationKey = getPullRequestGenerationRecordKey({
    worktreeId: activeWorktreeId,
    worktreePath,
    repoId: activeRepo?.id,
    branch: branchName
  })
  const activePullRequestGenerationRecordCandidate = activePullRequestGenerationKey
    ? (prGenerationRecords[activePullRequestGenerationKey] ?? null)
    : null
  const activePullRequestGenerationRecord =
    activePullRequestGenerationRecordCandidate &&
    activePullRequestGenerationRecordCandidate.context.repoId === activeRepo?.id &&
    activePullRequestGenerationRecordCandidate.context.branch === branchName
      ? activePullRequestGenerationRecordCandidate
      : null
  const activePullRequestGenerationSeedRestoreKey = getPullRequestGenerationSeedRestoreKey({
    recordKey: activePullRequestGenerationKey,
    record: activePullRequestGenerationRecord
  })
  const isBranchVisible = isVisible
  return {
    ...scope,
    collapsedSections,
    setCollapsedSections,
    persistedSourceControlViewMode,
    sourceControlViewMode,
    sourceControlGroupOrder,
    collapsedTreeDirs,
    setCollapsedTreeDirs,
    baseRefDialogOpen,
    setBaseRefDialogOpen,
    pendingDiscard,
    setPendingDiscard,
    defaultBaseRef,
    setDefaultBaseRef,
    filterQuery,
    setFilterQuery,
    commitDrafts,
    setCommitDrafts,
    commitDraftsRef,
    commitErrorsRef,
    commitErrors,
    setCommitErrors,
    remoteActionErrors,
    setRemoteActionErrors,
    remoteActionErrorSequenceByWorktreeRef,
    previousConflictOperationsRef,
    commitInFlightByWorktree,
    setCommitInFlightByWorktree,
    abortOperationInFlightByWorktree,
    setAbortOperationInFlightByWorktree,
    isAbortingOperation,
    confirmAction,
    isCommitting,
    generateInFlightRef,
    generateInFlightByWorktree,
    setGenerateInFlightByWorktree,
    generateErrors,
    setGenerateErrors,
    hostedReviewCreationState,
    setHostedReviewCreationState,
    hostedReviewCreationRequestState,
    setHostedReviewCreationRequestState,
    hostedReviewCreationProviderHintRef,
    createPrInFlightRef,
    createPrInFlightByWorktree,
    setCreatePrInFlightByWorktree,
    isCreatingPr,
    createPrIntentInFlightRef,
    createPrIntentRunTokenRef,
    createPrIntentCurrentTargetRef,
    createPrIntentInFlightByWorktree,
    setCreatePrIntentInFlightByWorktree,
    createPrIntentNotices,
    setCreatePrIntentNotices,
    isCreatePrIntentInFlight,
    createPrIntentNotice,
    setCreatePrIntentNoticeForWorktree,
    createPrIntentRunStillOwnsWorktree,
    createPrIntentActiveTargetConflicts,
    getCreatePrIntentOperationTarget,
    prGenerationRecords,
    allocatePullRequestGenerationRequestId,
    setPullRequestGenerationRecord,
    updatePullRequestGenerationRecord,
    commitMessageGenerationRecords,
    allocateCommitMessageGenerationRequestId,
    setCommitMessageGenerationRecord,
    updateCommitMessageGenerationRecord,
    commitMessage,
    commitError,
    remoteActionError,
    activeRemoteActionSequence,
    gitHistoryByWorktree,
    setGitHistoryByWorktree,
    gitHistoryRequestSeqRef,
    gitHistoryRequestByWorktreeRef,
    gitHistoryState,
    isGitHistoryExpanded,
    updateCommitDrafts,
    setCommitErrorForWorktree,
    isFolder,
    worktreePath,
    expandedSubmoduleKeys,
    submoduleStatusByKey,
    toggleSubmodule,
    activeCommitMessageGenerationKey,
    activeCommitMessageGenerationRecord,
    isGenerating,
    generateError,
    activeConnectionId,
    activeSourceControlLaunchPlatform,
    activePullRequestGenerationKey,
    activePullRequestGenerationRecordCandidate,
    activePullRequestGenerationRecord,
    activePullRequestGenerationSeedRestoreKey,
    isBranchVisible
  }
}

export type SourceControlInteractionStateController = ReturnType<
  typeof useSourceControlInteractionState
>
