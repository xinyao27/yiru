import type { RuntimeGitLocalBranches } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { useRouter } from 'expo-router'
import { useCallback, type MutableRefObject } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import type {
  MobileCommitFailureRecovery,
  RecordMobileCommitFailure
} from './mobile-commit-failure-recovery'
import type { MobileGitStatusResult } from './mobile-git-status'
import type { MobileSourceControlWorkflowResult } from './mobile-source-control-operation'
import type { LoadStatusOptions } from './mobile-source-control-screen-state'
import { useMobileCommitMessageGeneration } from './use-mobile-commit-message-generation'
import { useMobileCreatePrRunner } from './use-mobile-create-pr-runner'
import { useMobileSourceControlActionSheetRunners } from './use-mobile-source-control-action-sheet-runners'
import { useMobileSourceControlCommitRunners } from './use-mobile-source-control-commit-runners'
import { useMobileSourceControlHistoryOpener } from './use-mobile-source-control-history-opener'
import { useMobileSourceControlWorkflowRunner } from './use-mobile-source-control-workflow-runner'

type GitStep = { method: string; params?: Record<string, unknown> }
type SendGitRequest = <T>(method: string, params?: Record<string, unknown>) => Promise<T>

type Params = {
  client: RpcClient | null
  hostId: string
  worktreeId: string
  status: MobileGitStatusResult | null
  branchLabel: string
  commitMessage: string
  stagedEntries: MobileCommitFailureRecovery['stagedEntries']
  generatingMessage: boolean
  stageablePaths: string[]
  unstageablePaths: string[]
  router: ReturnType<typeof useRouter>
  sendGitRequest: SendGitRequest
  sendCommitRequest: (message: string) => Promise<unknown>
  runGitSyncSteps: () => Promise<MobileSourceControlWorkflowResult>
  loadStatus: (options?: LoadStatusOptions) => Promise<boolean>
  mountedRef: MutableRefObject<boolean>
  busyActionRef: MutableRefObject<string | null>
  setBusyAction: (next: string | null) => void
  setActionError: (next: string | null) => void
  setCommitMessage: (next: string) => void
  setGeneratingMessage: (next: boolean) => void
  setShowActionSheet: (next: boolean) => void
  setLocalBranches: (next: RuntimeGitLocalBranches | null) => void
  setShowBranchPicker: (next: boolean) => void
  setCreatedPrUrl: (next: string | null) => void
  setCreatedPrWarning: (next: string | null) => void
  recordCommitFailure: RecordMobileCommitFailure
  // Hub override: switch to the History segment instead of pushing the route.
  onOpenHistory?: () => void
  onHostedReviewRefresh?: () => void
}

export function useMobileSourceControlRunners(params: Params) {
  const {
    client,
    hostId,
    worktreeId,
    status,
    branchLabel,
    commitMessage,
    stagedEntries,
    generatingMessage,
    stageablePaths,
    unstageablePaths,
    router,
    sendGitRequest,
    sendCommitRequest,
    runGitSyncSteps,
    loadStatus,
    mountedRef,
    busyActionRef,
    setBusyAction,
    setActionError,
    setCommitMessage,
    setGeneratingMessage,
    setShowActionSheet,
    setLocalBranches,
    setShowBranchPicker,
    setCreatedPrUrl,
    setCreatedPrWarning,
    recordCommitFailure,
    onOpenHistory,
    onHostedReviewRefresh
  } = params

  const runGitWorkflow = useMobileSourceControlWorkflowRunner({
    sendGitRequest,
    loadStatus,
    mountedRef,
    busyActionRef,
    setBusyAction,
    setActionError,
    setCommitMessage,
    recordCommitFailure,
    onHostedReviewRefresh
  })

  const runGitAction = useCallback(
    async (actionId: string, method: string, p: Record<string, unknown>) => {
      return await runGitWorkflow(actionId, async () => {
        await sendGitRequest<unknown>(method, p)
      })
    },
    [runGitWorkflow, sendGitRequest]
  )

  const runGitSequence = useCallback(
    async (actionId: string, steps: GitStep[], options?: { clearCommitMessage?: boolean }) => {
      return await runGitWorkflow(
        actionId,
        async () => {
          for (const step of steps) {
            await sendGitRequest<unknown>(step.method, step.params)
          }
        },
        options
      )
    },
    [runGitWorkflow, sendGitRequest]
  )

  const runGitSync = useCallback(
    async (actionId: string) => await runGitWorkflow(actionId, runGitSyncSteps),
    [runGitSyncSteps, runGitWorkflow]
  )

  const stageAll = useCallback(async () => {
    if (stageablePaths.length === 0) {
      return
    }
    await runGitAction('stage-all', 'git.bulkStage', { filePaths: stageablePaths })
  }, [runGitAction, stageablePaths])

  const unstageAll = useCallback(async () => {
    if (unstageablePaths.length === 0) {
      return
    }
    await runGitAction('unstage-all', 'git.bulkUnstage', { filePaths: unstageablePaths })
  }, [runGitAction, unstageablePaths])

  const { commit, runCommitSequence, runCommitSyncSequence } = useMobileSourceControlCommitRunners({
    commitMessage,
    stagedEntries,
    sendGitRequest,
    sendCommitRequest,
    runGitSyncSteps,
    runGitWorkflow,
    loadStatus,
    mountedRef,
    busyActionRef,
    setBusyAction,
    setActionError,
    setCommitMessage,
    recordCommitFailure,
    onHostedReviewRefresh
  })

  const { generateCommitMessage, cancelGenerateCommitMessage } = useMobileCommitMessageGeneration({
    client,
    worktreeId,
    generatingMessage,
    mountedRef,
    busyActionRef,
    setGeneratingMessage,
    setCommitMessage,
    setActionError
  })

  const createPr = useMobileCreatePrRunner({
    client,
    worktreeId,
    status,
    branchLabel,
    commitMessage,
    stagedEntries,
    mountedRef,
    runGitWorkflow,
    loadStatus,
    setActionError,
    setCommitMessage,
    setShowActionSheet,
    setCreatedPrUrl,
    setCreatedPrWarning,
    recordCommitFailure
  })

  const openBranchPicker = useCallback(() => {
    setShowActionSheet(false)
    setLocalBranches(null)
    setShowBranchPicker(true)
    if (client) {
      void sendGitRequest<RuntimeGitLocalBranches>('git.localBranches')
        .then((result) => {
          if (mountedRef.current) {
            setLocalBranches(result)
          }
        })
        .catch(() => {
          if (mountedRef.current) {
            setLocalBranches({ current: null, branches: [] })
          }
        })
    }
  }, [
    client,
    mountedRef,
    sendGitRequest,
    setLocalBranches,
    setShowActionSheet,
    setShowBranchPicker
  ])

  const openHistory = useMobileSourceControlHistoryOpener({
    hostId,
    worktreeId,
    router,
    setShowActionSheet,
    onOpenHistory
  })

  const checkoutBranch = useCallback(
    async (branch: string) => {
      setShowBranchPicker(false)
      await runGitAction('checkout', 'git.checkout', { branch })
    },
    [runGitAction, setShowBranchPicker]
  )

  const actionSheetRunners = useMobileSourceControlActionSheetRunners({
    client,
    worktreeId,
    sendGitRequest,
    runGitWorkflow,
    runGitSequence,
    runGitSync,
    commit,
    runCommitSequence,
    runCommitSyncSequence,
    setShowActionSheet
  })

  const abortConflictOperation = useCallback(
    async (operation: string) => {
      const method =
        operation === 'merge' ? 'git.abortMerge' : operation === 'rebase' ? 'git.abortRebase' : null
      if (!method) {
        return
      }
      await runGitAction(`abort-${operation}`, method, {})
    },
    [runGitAction]
  )

  return {
    runGitAction,
    stageAll,
    unstageAll,
    commit,
    generateCommitMessage,
    cancelGenerateCommitMessage,
    createPr,
    openBranchPicker,
    openHistory,
    checkoutBranch,
    abortConflictOperation,
    ...actionSheetRunners
  }
}
