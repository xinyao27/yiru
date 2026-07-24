import type { HostedReviewInfo } from '@yiru/workbench-model/review'
import { resolveHostedReviewCreationProvider } from '@yiru/workbench-model/review'
import { useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'

import { localizedHostedReviewCopy } from '@/i18n/hosted-review-localized-copy'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/connection-context'
import {
  beginHugeRepoWarningProbe,
  hasDismissedHugeRepoWarning,
  markHugeRepoWarningDismissed
} from '@/lib/source-control-huge-repo-warning-dismissals'
import { getRuntimeRepoBaseRefDefault } from '@/runtime/runtime-repo-client'
import type { PullRequestGenerationContext } from '@/store/slices/pull-request-generation'

import { refreshGitStatusForWorktree } from './git-status-refresh'
import {
  resolveSourceControlBaseRef,
  resolveSourceControlCompareBaseRef,
  resolveSourceControlPickerBaseRef
} from './source-control-base-ref'
import type { SourceControlInteractionStateController } from './source-control-controller-interaction-state'

export function useSourceControlStatusRefresh(scope: SourceControlInteractionStateController) {
  const {
    activeConnectionId,
    activePrFromQueue,
    activeRepo,
    activeRepoSettings,
    activeWorktree,
    activeWorktreeId,
    activeWorktreeInstanceId,
    branchName,
    createPrIntentCurrentTargetRef,
    defaultBaseRef,
    entries,
    fetchUpstreamStatus,
    hostedReviewCacheKey,
    hostedReviewCreationState,
    hostedReviewEntryData,
    isBranchVisible,
    isFolder,
    remoteStatus,
    repositoryHuge,
    setDefaultBaseRef,
    setGitStatus,
    setUpstreamStatus,
    settings,
    updateWorktreeGitIdentity,
    worktreeMap,
    worktreePath
  } = scope
  const refreshActiveGitStatus = useCallback(async (): Promise<void> => {
    if (!activeWorktreeId || !worktreePath || isFolder) {
      return
    }
    const connectionId = getConnectionId(activeWorktreeId) ?? undefined
    await refreshGitStatusForWorktree({
      // Why: route git status by the repo OWNER host, not the focused runtime.
      settings: activeRepoSettings,
      worktreeId: activeWorktreeId,
      worktreePath,
      connectionId,
      pushTarget: activeWorktree?.pushTarget,
      deps: {
        setGitStatus,
        updateWorktreeGitIdentity,
        setUpstreamStatus,
        fetchUpstreamStatus
      }
    })
  }, [
    activeRepoSettings,
    activeWorktreeId,
    activeWorktree?.pushTarget,
    fetchUpstreamStatus,
    isFolder,
    setGitStatus,
    setUpstreamStatus,
    updateWorktreeGitIdentity,
    worktreePath
  ])
  const refreshActiveGitStatusAfterMutation = useCallback(async (): Promise<void> => {
    try {
      await refreshActiveGitStatus()
    } catch (error) {
      console.warn('[SourceControl] post-mutation git status refresh failed', error)
    }
  }, [refreshActiveGitStatus])
  useEffect(() => {
    if (!repositoryHuge || !activeWorktreeId || !worktreePath || activeConnectionId) {
      return
    }
    const warningProbe = beginHugeRepoWarningProbe({
      id: activeWorktreeId,
      instanceId: activeWorktreeInstanceId
    })
    if (hasDismissedHugeRepoWarning(warningProbe)) {
      return
    }
    let cancelled = false
    void window.api.git
      .findHugeFoldersToIgnore({ worktreePath })
      .then((folders) => {
        if (cancelled || folders.length === 0 || hasDismissedHugeRepoWarning(warningProbe)) {
          return
        }
        if (!markHugeRepoWarningDismissed(warningProbe)) {
          return
        }
        const folderName = folders[0]
        toast.warning(
          translate(
            'auto.components.right.sidebar.SourceControl.hugeRepoIgnorePrompt',
            'This repository has too many active changes. Add "{{value0}}" to .gitignore?',
            { value0: folderName }
          ),
          {
            action: {
              label: translate(
                'auto.components.right.sidebar.SourceControl.hugeRepoIgnoreAction',
                'Add to .gitignore'
              ),
              onClick: () => {
                // Why: the toast can outlive its worktree; a purged probe must
                // not write .gitignore in a same-path replacement.
                if (!hasDismissedHugeRepoWarning(warningProbe)) {
                  return
                }
                void window.api.git
                  .appendGitignore({ worktreePath, folderName })
                  .then(() => refreshActiveGitStatus())
                  .catch((error) => console.warn('[SourceControl] add to .gitignore failed', error))
              }
            }
          }
        )
      })
      .catch((error) => console.warn('[SourceControl] findHugeFoldersToIgnore failed', error))
    return () => {
      cancelled = true
    }
  }, [
    repositoryHuge,
    activeWorktreeId,
    activeWorktreeInstanceId,
    worktreePath,
    activeConnectionId,
    refreshActiveGitStatus
  ])
  const refreshGitStatusAfterPullRequestGeneration = useCallback(
    async (context: PullRequestGenerationContext): Promise<void> => {
      if (!context.worktreeId || isFolder) {
        return
      }
      try {
        await refreshGitStatusForWorktree({
          // Why: generation can finish after the user switches hosts; refresh
          // the same host that owned the generation request.
          settings: context.runtimeTargetSettings,
          worktreeId: context.worktreeId,
          worktreePath: context.worktreePath,
          connectionId: context.connectionId,
          pushTarget: worktreeMap.get(context.worktreeId)?.pushTarget,
          deps: {
            setGitStatus,
            updateWorktreeGitIdentity,
            setUpstreamStatus,
            fetchUpstreamStatus
          }
        })
      } catch (error) {
        console.warn('[SourceControl] post-generation git status refresh failed', error)
      }
    },
    [
      fetchUpstreamStatus,
      isFolder,
      setGitStatus,
      setUpstreamStatus,
      updateWorktreeGitIdentity,
      worktreeMap
    ]
  )
  useEffect(() => {
    if (!isBranchVisible || !activeRepo || isFolder) {
      return
    }

    // Why: clear the previous repo's base until IPC resolves so branch compare
    // cannot briefly run against a stale cross-repo ref.
    setDefaultBaseRef(null)

    let stale = false
    void getRuntimeRepoBaseRefDefault(activeRepoSettings, activeRepo.id)
      .then((result) => {
        if (!stale) {
          // Why: this panel consumes only `defaultBaseRef`; BaseRefPicker owns
          // the envelope's remote-count hint.
          setDefaultBaseRef(result.defaultBaseRef)
        }
      })
      .catch((err) => {
        console.error('[SourceControl] getBaseRefDefault failed', err)
        // Why: keep the base null on failure so compare/review fetches cannot
        // target a fabricated branch.
        if (!stale) {
          setDefaultBaseRef(null)
        }
      })

    return () => {
      stale = true
    }
  }, [activeRepo, activeRepoSettings, isBranchVisible, isFolder, setDefaultBaseRef])
  const normalizedWorktreeBaseRef = activeWorktree?.baseRef?.trim() || null
  const normalizedRepoBaseRef = activeRepo?.worktreeBaseRef?.trim() || null
  const baseRefOwnedByWorktree = normalizedWorktreeBaseRef !== null
  const pinnedBaseRef = normalizedWorktreeBaseRef ?? normalizedRepoBaseRef
  const hasUncommittedEntries = entries.length > 0
  const hostedReviewCreation =
    hostedReviewCreationState &&
    activeRepo?.id === hostedReviewCreationState.repoId &&
    activeWorktreeId === hostedReviewCreationState.worktreeId &&
    branchName === hostedReviewCreationState.branch
      ? hostedReviewCreationState.data
      : null
  const hostedReviewCreateProvider = resolveHostedReviewCreationProvider(
    hostedReviewCreation?.provider
  )
  const hostedReviewCreateCopy = localizedHostedReviewCopy(hostedReviewCreateProvider)
  const hostedReview: HostedReviewInfo | null = useMemo(() => {
    if (!hostedReviewCacheKey) {
      return null
    }
    if (activePrFromQueue) {
      return { provider: 'github', ...activePrFromQueue, status: activePrFromQueue.checksStatus }
    }
    return hostedReviewEntryData
  }, [activePrFromQueue, hostedReviewCacheKey, hostedReviewEntryData])
  const effectiveBaseRef = resolveSourceControlBaseRef({
    worktreeBaseRef: normalizedWorktreeBaseRef,
    reviewBaseRefName: hostedReview?.baseRefName,
    repoBaseRef: normalizedRepoBaseRef,
    defaultBaseRef
  })
  const compareBaseRef = resolveSourceControlCompareBaseRef({
    enabled: settings?.sourceControlCompareAgainstUpstream ?? false,
    worktreeBaseRef: normalizedWorktreeBaseRef,
    repoBaseRef: normalizedRepoBaseRef,
    upstreamName: remoteStatus?.upstreamName ?? null,
    fallbackBaseRef: effectiveBaseRef
  })
  const pickerBaseRef = resolveSourceControlPickerBaseRef({
    pinnedBaseRef,
    effectiveBaseRef
  })
  useEffect(() => {
    createPrIntentCurrentTargetRef.current = {
      repoId: activeRepo?.id ?? null,
      worktreeId: activeWorktreeId ?? null,
      worktreePath,
      branch: branchName,
      baseRef: effectiveBaseRef ?? null
    }
  }, [
    activeRepo?.id,
    activeWorktreeId,
    branchName,
    createPrIntentCurrentTargetRef,
    effectiveBaseRef,
    worktreePath
  ])
  const linkedGitHubPR = activeWorktree?.linkedPR ?? null
  const fallbackGitHubPRNumber = linkedGitHubPR == null ? (activePrFromQueue?.number ?? null) : null
  const linkedGitLabMR = activeWorktree?.linkedGitLabMR ?? null
  const linkedBitbucketPR = activeWorktree?.linkedBitbucketPR ?? null
  const linkedAzureDevOpsPR = activeWorktree?.linkedAzureDevOpsPR ?? null
  const linkedGiteaPR = activeWorktree?.linkedGiteaPR ?? null
  return {
    ...scope,
    refreshActiveGitStatus,
    refreshActiveGitStatusAfterMutation,
    refreshGitStatusAfterPullRequestGeneration,
    normalizedWorktreeBaseRef,
    normalizedRepoBaseRef,
    baseRefOwnedByWorktree,
    pinnedBaseRef,
    hasUncommittedEntries,
    hostedReviewCreation,
    hostedReviewCreateProvider,
    hostedReviewCreateCopy,
    hostedReview,
    effectiveBaseRef,
    compareBaseRef,
    pickerBaseRef,
    linkedGitHubPR,
    fallbackGitHubPRNumber,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR
  }
}

export type SourceControlStatusRefreshController = ReturnType<typeof useSourceControlStatusRefresh>
