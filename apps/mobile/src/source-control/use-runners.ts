import type { RuntimeGitLocalBranches } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { useRouter } from 'expo-router'
import { useCallback, type MutableRefObject } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import type {
  MobileCommitFailureRecovery,
  RecordMobileCommitFailure
} from './commit-failure-recovery'
import type { MobileGitStatusResult } from './git-status'
import type { MobileSourceControlWorkflowResult } from './operation'
import type { LoadStatusOptions } from './screen-state'
import { useMobileSourceControlActionSheetRunners } from './use-action-sheet-runners'
import { useMobileCommitMessageGeneration } from './use-commit-message-generation'
import { useMobileSourceControlCommitRunners } from './use-commit-runners'
import { useMobileCreatePrRunner } from './use-create-pr-runner'
import { runMobileGitStep, type MobileGitRequests, type MobileGitStep } from './use-git-requests'
import { useMobileSourceControlHistoryOpener } from './use-history-opener'
import { useMobileSourceControlWorkflowRunner } from './use-workflow-runner'

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
  gitRequests: MobileGitRequests
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
    gitRequests,
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
    gitFetch: gitRequests.fetch,
    loadStatus,
    mountedRef,
    busyActionRef,
    setBusyAction,
    setActionError,
    setCommitMessage,
    recordCommitFailure,
    onHostedReviewRefresh
  })

  const runGitStep = useCallback(
    async (actionId: string, step: MobileGitStep) => {
      return await runGitWorkflow(actionId, async () => {
        await runMobileGitStep(gitRequests, step)
      })
    },
    [gitRequests, runGitWorkflow]
  )

  const runGitSequence = useCallback(
    async (
      actionId: string,
      steps: MobileGitStep[],
      options?: { clearCommitMessage?: boolean }
    ) => {
      return await runGitWorkflow(
        actionId,
        async () => {
          for (const step of steps) {
            await runMobileGitStep(gitRequests, step)
          }
        },
        options
      )
    },
    [gitRequests, runGitWorkflow]
  )

  const runGitSync = useCallback(
    async (actionId: string) => await runGitWorkflow(actionId, runGitSyncSteps),
    [runGitSyncSteps, runGitWorkflow]
  )

  const stageAll = useCallback(async () => {
    if (stageablePaths.length === 0) {
      return
    }
    await runGitStep('stage-all', { kind: 'bulkStage', filePaths: stageablePaths })
  }, [runGitStep, stageablePaths])

  const unstageAll = useCallback(async () => {
    if (unstageablePaths.length === 0) {
      return
    }
    await runGitStep('unstage-all', { kind: 'bulkUnstage', filePaths: unstageablePaths })
  }, [runGitStep, unstageablePaths])

  const { commit, runCommitSequence, runCommitSyncSequence } = useMobileSourceControlCommitRunners({
    commitMessage,
    stagedEntries,
    gitRequests,
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
      void gitRequests
        .localBranches()
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
  }, [client, gitRequests, mountedRef, setLocalBranches, setShowActionSheet, setShowBranchPicker])

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
      await runGitStep('checkout', { kind: 'checkout', branch })
    },
    [runGitStep, setShowBranchPicker]
  )

  const actionSheetRunners = useMobileSourceControlActionSheetRunners({
    client,
    worktreeId,
    gitRequests,
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
      const step: MobileGitStep | null =
        operation === 'merge'
          ? { kind: 'abortMerge' }
          : operation === 'rebase'
            ? { kind: 'abortRebase' }
            : null
      if (!step) {
        return
      }
      await runGitStep(`abort-${operation}`, step)
    },
    [runGitStep]
  )

  return {
    runGitStep,
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
