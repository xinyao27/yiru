import { shouldForcePushWithLeaseForUpstream } from '@yiru/workbench-model/review'
import { useCallback } from 'react'
import { toast } from 'sonner'

import {
  localizedHostedReviewCopy,
  resolveSupportedHostedReviewCopyProvider
} from '@/i18n/hosted-review-localized-copy'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/connection-context'
import { openWorkspacePanelTab } from '@/lib/open-workspace-panel-tab'
import { abortRuntimeGitMerge, abortRuntimeGitRebase } from '@/runtime/runtime-git-client'

import type { GitConflictOperation } from '../../../../shared/types'
import type { SourceControlRemoteActionsController } from './source-control-controller-remote-actions'
import type {
  AbortConflictOperation,
  CreatedHostedReview,
  HostedReviewCreatedContext
} from './source-control-panel-types'
import { refreshSourceControlAfterRemoteAction } from './source-control-remote-action-state'

export function useSourceControlConflictActions(scope: SourceControlRemoteActionsController) {
  const {
    activeRepo,
    activeRepoSettings,
    activeWorktreeId,
    branchName,
    confirmAction,
    conflictOperation,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    fetchPRForBranch,
    handleCommit,
    isAbortingOperation,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitHubPR,
    linkedGitLabMR,
    linkedGiteaPR,
    refreshActiveGitStatusAfterMutation,
    refreshBranchCompareRef,
    refreshGitHistoryRef,
    remoteStatus,
    remoteStatusForActions,
    runRemoteAction,
    setAbortOperationInFlightByWorktree,
    setRemoteActionErrors,
    updateWorktreeMeta,
    worktreePath
  } = scope
  const handleAbortOperation = useCallback(
    async (requestedOperation: AbortConflictOperation): Promise<void> => {
      if (
        !activeWorktreeId ||
        !worktreePath ||
        conflictOperation !== requestedOperation ||
        isAbortingOperation
      ) {
        return
      }

      const isRebase = requestedOperation === 'rebase'
      const label = isRebase ? 'rebase' : 'merge'
      const title = isRebase ? 'Abort rebase?' : 'Abort merge?'
      const description = isRebase
        ? 'This cancels the rebase in progress and can discard conflict resolutions made during this rebase.'
        : 'This cancels the merge in progress and can discard conflict resolutions made during this merge.'
      const confirmed = await confirmAction({
        title,
        description,
        confirmLabel: `Abort ${label}`,
        confirmVariant: 'destructive'
      })
      if (!confirmed) {
        return
      }

      const connectionId = getConnectionId(activeWorktreeId) ?? undefined
      setAbortOperationInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: true }))
      setRemoteActionErrors((prev) => ({ ...prev, [activeWorktreeId]: null }))
      try {
        const context = {
          // Why: route the abort by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        }
        const abortGitOperation = isRebase ? abortRuntimeGitRebase : abortRuntimeGitMerge
        await abortGitOperation(context)
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to abort ${label}`
        toast.error(
          translate(
            'auto.components.right.sidebar.SourceControl.f99560ab29',
            'Abort {{value0}} failed',
            { value0: label }
          ),
          { description: message }
        )
        setRemoteActionErrors((prev) => ({
          ...prev,
          [activeWorktreeId]: {
            kind: isRebase ? 'abort_rebase' : 'abort_merge',
            message,
            rawError: message
          }
        }))
      } finally {
        setAbortOperationInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: false }))
        refreshSourceControlAfterRemoteAction({
          refreshGitStatus: refreshActiveGitStatusAfterMutation,
          refreshBranchCompare: refreshBranchCompareRef.current,
          refreshGitHistory: refreshGitHistoryRef.current
        })
      }
    },
    [
      activeRepoSettings,
      activeWorktreeId,
      confirmAction,
      conflictOperation,
      isAbortingOperation,
      refreshBranchCompareRef,
      refreshActiveGitStatusAfterMutation,
      refreshGitHistoryRef,
      setAbortOperationInFlightByWorktree,
      setRemoteActionErrors,
      worktreePath
    ]
  )
  const handleAbortMerge = useCallback(async (): Promise<void> => {
    await handleAbortOperation('merge')
  }, [handleAbortOperation])
  const handleAbortRebase = useCallback(async (): Promise<void> => {
    await handleAbortOperation('rebase')
  }, [handleAbortOperation])
  const handleAbortOperationForConflict = useCallback(
    (operation: GitConflictOperation): void => {
      if (operation === 'merge') {
        void handleAbortMerge()
        return
      }
      if (operation === 'rebase') {
        void handleAbortRebase()
      }
    },
    [handleAbortMerge, handleAbortRebase]
  )
  const runCompoundCommitAction = useCallback(
    async (remoteKind: 'push' | 'sync'): Promise<void> => {
      const ok = await handleCommit()
      if (!ok) {
        return
      }
      // Why: compound Commit & Force Push maps to `push`; upgrade only this
      // compound path so the explicit dropdown Push remains non-force.
      if (
        remoteKind === 'push' &&
        shouldForcePushWithLeaseForUpstream(remoteStatusForActions ?? remoteStatus)
      ) {
        await runRemoteAction('force_push')
        return
      }
      await runRemoteAction(remoteKind)
    },
    [handleCommit, remoteStatus, remoteStatusForActions, runRemoteAction]
  )
  const handlePullRequestCreated = useCallback(
    async (result: CreatedHostedReview, context?: HostedReviewCreatedContext): Promise<void> => {
      const repoPath = context?.repoPath ?? activeRepo?.path
      const repoId = context?.repoId ?? activeRepo?.id
      const branch = context?.branch ?? branchName
      const worktreeId = context?.worktreeId ?? activeWorktreeId ?? null
      const openChecks = context?.openChecks ?? true
      if (!repoPath || !repoId || !branch) {
        return
      }
      const copy = localizedHostedReviewCopy(
        resolveSupportedHostedReviewCopyProvider(result.provider)
      )
      if (openChecks) {
        openWorkspacePanelTab({ panel: 'checks', worktreeId })
      }
      try {
        if (worktreeId && result.provider === 'github') {
          await updateWorktreeMeta(worktreeId, { linkedPR: result.number })
        }
        if (worktreeId && result.provider === 'gitlab') {
          await updateWorktreeMeta(worktreeId, { linkedGitLabMR: result.number })
        }
        if (worktreeId && result.provider === 'azure-devops') {
          await updateWorktreeMeta(worktreeId, { linkedAzureDevOpsPR: result.number })
        }
        if (worktreeId && result.provider === 'gitea') {
          await updateWorktreeMeta(worktreeId, { linkedGiteaPR: result.number })
        }
        const linkedReviewNumbers = {
          linkedGitHubPR: result.provider === 'github' ? result.number : linkedGitHubPR,
          fallbackGitHubPR: fallbackGitHubPRNumber,
          linkedGitLabMR: result.provider === 'gitlab' ? result.number : linkedGitLabMR,
          linkedBitbucketPR,
          linkedAzureDevOpsPR:
            result.provider === 'azure-devops' ? result.number : linkedAzureDevOpsPR,
          linkedGiteaPR: result.provider === 'gitea' ? result.number : linkedGiteaPR
        }
        if (result.provider === 'gitlab') {
          await fetchHostedReviewForBranch(repoPath, branch, {
            force: true,
            repoId,
            ...linkedReviewNumbers
          })
          return
        }
        if (result.provider !== 'github') {
          await fetchHostedReviewForBranch(repoPath, branch, {
            force: true,
            repoId,
            ...linkedReviewNumbers
          })
          return
        }
        await Promise.all([
          fetchHostedReviewForBranch(repoPath, branch, {
            force: true,
            repoId,
            ...linkedReviewNumbers
          }),
          fetchPRForBranch(repoPath, branch, {
            force: true,
            repoId,
            worktreeId: worktreeId ?? undefined,
            linkedPRNumber: result.number
          })
        ])
      } catch {
        toast.warning(
          translate(
            'auto.components.right.sidebar.SourceControl.0453ca3a9a',
            '{{value0}} created, but Yiru could not refresh it yet.',
            { value0: copy.titleLabel }
          ),
          {
            action: {
              label: translate(
                'auto.components.right.sidebar.SourceControl.812cb992ee',
                'Open on {{value0}}',
                { value0: copy.providerName }
              ),
              onClick: () => window.api.shell.openUrl(result.url)
            }
          }
        )
      }
    },
    [
      activeRepo,
      activeWorktreeId,
      branchName,
      fallbackGitHubPRNumber,
      fetchHostedReviewForBranch,
      fetchPRForBranch,
      linkedAzureDevOpsPR,
      linkedBitbucketPR,
      linkedGiteaPR,
      linkedGitHubPR,
      linkedGitLabMR,
      updateWorktreeMeta
    ]
  )
  const openHostedReviewInChecks = useCallback(() => {
    openWorkspacePanelTab({ panel: 'checks', worktreeId: activeWorktreeId })
  }, [activeWorktreeId])
  const handleBranchChangedByPullRequestGeneration = useCallback(async (): Promise<void> => {
    // Why: AI PR detail generation may rebase before summarizing; if HEAD moved,
    // refresh status before letting the user submit the generated draft.
    await refreshActiveGitStatusAfterMutation()
  }, [refreshActiveGitStatusAfterMutation])
  return {
    ...scope,
    handleAbortOperation,
    handleAbortMerge,
    handleAbortRebase,
    handleAbortOperationForConflict,
    runCompoundCommitAction,
    handlePullRequestCreated,
    openHostedReviewInChecks,
    handleBranchChangedByPullRequestGeneration
  }
}

export type SourceControlConflictActionsController = ReturnType<
  typeof useSourceControlConflictActions
>
