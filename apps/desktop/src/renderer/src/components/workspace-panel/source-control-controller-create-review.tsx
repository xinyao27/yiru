import { useCallback } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'

import { normalizeHostedReviewHeadRef } from '../../../../shared/hosted-review-refs'
import type { SourceControlReviewDialogController } from './source-control-controller-review-dialog'
import { resolveBlockedCreateReviewNoticeMessage } from './source-control-create-review-blocked-action'
import { stripBaseRef } from './use-create-pull-request-dialog-fields'

export function useSourceControlCreateReview(scope: SourceControlReviewDialogController) {
  const {
    activeRepo,
    activeWorktreeId,
    branchName,
    createHostedReview,
    createPrInFlightRef,
    handlePullRequestCreated,
    hostedReviewCreateCopy,
    hostedReviewCreateProvider,
    hostedReviewCreation,
    prBase,
    prBody,
    prDraft,
    prGenerating,
    prTitle,
    resolvedPrCreationDefaults,
    setCreatePrInFlightByWorktree,
    setCreatePrIntentNoticeForWorktree,
    worktreePath
  } = scope
  const handleCreatePullRequest = useCallback(async (): Promise<void> => {
    if (
      !activeRepo ||
      !activeWorktreeId ||
      !worktreePath ||
      !hostedReviewCreation ||
      prGenerating ||
      createPrInFlightRef.current[activeWorktreeId]
    ) {
      return
    }

    if (!hostedReviewCreation.canCreate) {
      // Why: blocked Create Review clicks are intentional for actionable states;
      // the inline notice tells users which prerequisite to clear next.
      const message = resolveBlockedCreateReviewNoticeMessage(hostedReviewCreation)
      if (message) {
        setCreatePrIntentNoticeForWorktree(activeWorktreeId, {
          tone: 'destructive',
          message
        })
      }
      return
    }

    const base = stripBaseRef(prBase).trim()
    const title = prTitle.trim()

    if (!title) {
      setCreatePrIntentNoticeForWorktree(activeWorktreeId, {
        tone: 'destructive',
        message: translate(
          'auto.components.right.sidebar.SourceControl.f3a8b2c1d0e5',
          'Enter a {{value0}} title.',
          { value0: hostedReviewCreateCopy.reviewLabel }
        )
      })
      return
    }

    if (!base || stripBaseRef(base).toLowerCase() === stripBaseRef(branchName).toLowerCase()) {
      setCreatePrIntentNoticeForWorktree(activeWorktreeId, {
        tone: 'destructive',
        message: translate(
          'auto.components.right.sidebar.SourceControl.ae743199cd',
          'Choose a different base branch before creating a {{value0}}.',
          { value0: hostedReviewCreateCopy.reviewLabel }
        )
      })
      return
    }

    createPrInFlightRef.current[activeWorktreeId] = true
    setCreatePrInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: true }))
    setCreatePrIntentNoticeForWorktree(activeWorktreeId, null)
    try {
      const result = await createHostedReview(activeRepo.path, {
        repoId: activeRepo.id,
        provider: hostedReviewCreateProvider,
        base,
        head: normalizeHostedReviewHeadRef(branchName),
        title,
        body: prBody,
        draft: prDraft,
        worktreePath,
        useTemplate: resolvedPrCreationDefaults.useTemplate
      })

      if (result.ok) {
        setCreatePrIntentNoticeForWorktree(activeWorktreeId, null)
        await handlePullRequestCreated({
          provider: hostedReviewCreateProvider,
          number: result.number,
          url: result.url
        })
        if (resolvedPrCreationDefaults.openAfterCreate) {
          window.api.shell.openUrl(result.url)
        }
        return
      }

      if (result.existingReview?.url) {
        const number = result.existingReview.number
        toast.success(
          number
            ? translate(
                'auto.components.right.sidebar.SourceControl.eef5446523',
                '{{value0}} #{{value1}} is already open',
                { value0: hostedReviewCreateCopy.titleLabel, value1: number }
              )
            : translate(
                'auto.components.right.sidebar.SourceControl.d6fb1df5fe',
                '{{value0}} is already open',
                { value0: hostedReviewCreateCopy.titleLabel }
              ),
          {
            action: {
              label: translate(
                'auto.components.right.sidebar.SourceControl.812cb992ee',
                'Open on {{value0}}',
                { value0: hostedReviewCreateCopy.providerName }
              ),
              onClick: () => window.api.shell.openUrl(result.existingReview!.url)
            }
          }
        )
        if (number) {
          setCreatePrIntentNoticeForWorktree(activeWorktreeId, null)
          await handlePullRequestCreated({
            provider: hostedReviewCreateProvider,
            number,
            url: result.existingReview.url
          })
          return
        }
      }

      setCreatePrIntentNoticeForWorktree(activeWorktreeId, {
        tone: 'destructive',
        message: result.error
      })
    } catch (error) {
      setCreatePrIntentNoticeForWorktree(activeWorktreeId, {
        tone: 'destructive',
        message:
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.right.sidebar.SourceControl.e2b7a1c0d9f4',
                'Failed to create {{value0}}',
                { value0: hostedReviewCreateCopy.reviewLabel }
              )
      })
    } finally {
      createPrInFlightRef.current[activeWorktreeId] = false
      setCreatePrInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: false }))
    }
  }, [
    activeRepo,
    activeWorktreeId,
    branchName,
    createPrInFlightRef,
    createHostedReview,
    handlePullRequestCreated,
    hostedReviewCreation,
    hostedReviewCreateCopy.providerName,
    hostedReviewCreateCopy.reviewLabel,
    hostedReviewCreateCopy.titleLabel,
    hostedReviewCreateProvider,
    prBase,
    prBody,
    prDraft,
    prGenerating,
    prTitle,
    resolvedPrCreationDefaults.openAfterCreate,
    resolvedPrCreationDefaults.useTemplate,
    setCreatePrInFlightByWorktree,
    setCreatePrIntentNoticeForWorktree,
    worktreePath
  ])
  return { ...scope, handleCreatePullRequest }
}

export type SourceControlCreateReviewController = ReturnType<typeof useSourceControlCreateReview>
