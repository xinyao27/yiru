import { useCallback } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import { resolveMobileBranchCompareBaseRef } from './branch-base-ref'
import type { RunMobileSourceControlWorkflow } from './operation'
import type { MobileGitRequests, MobileGitStep } from './use-git-requests'

type Params = {
  client: RpcClient | null
  worktreeId: string
  gitRequests: MobileGitRequests
  runGitWorkflow: RunMobileSourceControlWorkflow
  runGitSequence: (actionId: string, steps: MobileGitStep[]) => Promise<boolean>
  runGitSync: (actionId: string) => Promise<boolean>
  commit: () => Promise<boolean>
  runCommitSequence: (actionId: string, afterCommit: MobileGitStep[]) => Promise<boolean>
  runCommitSyncSequence: () => Promise<boolean>
  setShowActionSheet: (next: boolean) => void
}

// The action-sheet entry runners: each performs an action then dismisses the
// sheet. Split from the main runners hook to stay under the line limit.
export function useMobileSourceControlActionSheetRunners(params: Params) {
  const {
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
  } = params

  const runActionSheetCommit = useCallback(async () => {
    await commit()
    setShowActionSheet(false)
  }, [commit, setShowActionSheet])

  const runActionSheetCommitSequence = useCallback(
    async (actionId: string, afterCommit: MobileGitStep[]) => {
      await runCommitSequence(actionId, afterCommit)
      setShowActionSheet(false)
    },
    [runCommitSequence, setShowActionSheet]
  )

  const runActionSheetCommitSync = useCallback(async () => {
    await runCommitSyncSequence()
    setShowActionSheet(false)
  }, [runCommitSyncSequence, setShowActionSheet])

  const runActionSheetGitSequence = useCallback(
    async (actionId: string, steps: MobileGitStep[]) => {
      await runGitSequence(actionId, steps)
      setShowActionSheet(false)
    },
    [runGitSequence, setShowActionSheet]
  )

  const runActionSheetGitSync = useCallback(async () => {
    await runGitSync('sync')
    setShowActionSheet(false)
  }, [runGitSync, setShowActionSheet])

  const runActionSheetRebase = useCallback(async () => {
    await runGitWorkflow('rebase', async () => {
      if (!client) {
        throw new Error('Waiting for desktop...')
      }
      const baseRef = await resolveMobileBranchCompareBaseRef(client, worktreeId)
      if (!baseRef) {
        throw new Error('No base branch to rebase onto')
      }
      await gitRequests.rebaseFromBase(baseRef)
    })
    setShowActionSheet(false)
  }, [client, gitRequests, runGitWorkflow, setShowActionSheet, worktreeId])

  return {
    runActionSheetCommit,
    runActionSheetCommitSequence,
    runActionSheetCommitSync,
    runActionSheetGitSequence,
    runActionSheetGitSync,
    runActionSheetRebase
  }
}
