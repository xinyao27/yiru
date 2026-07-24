import { useMemo } from 'react'

import { getRuntimeGitScope } from '@/runtime/runtime-git-client'

import { getCommitMessageModelDiscoveryHostKeyForScope } from '../../../../shared/commit-message-host-key'
import {
  DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
  resolveSourceControlAiEnabled,
  resolveSourceControlAiForOperation,
  resolveSourceControlAiPrCreationDefaults
} from '../../../../shared/source-control-ai'
import type { useChecksPanelReviewContextState } from './checks-panel-review-context'

export function useChecksPanelGenerationDefaults(context: useChecksPanelReviewContextState) {
  const { activeReview, branch, hostedReviewCreation, isFolder, repo, settings } = context

  const prCreationDefaults = useMemo(() => {
    if (!settings) {
      return DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
    }
    const hostKey = getCommitMessageModelDiscoveryHostKeyForScope(
      getRuntimeGitScope(settings, repo?.connectionId)
    )
    const resolved = resolveSourceControlAiForOperation({
      settings,
      repo,
      operation: 'pullRequest',
      discoveryHostKey: hostKey,
      prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
    })
    return resolved.ok
      ? resolved.value.prCreationDefaults
      : resolveSourceControlAiPrCreationDefaults({
          settings,
          repo,
          prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
        })
  }, [repo, settings])
  const sourceControlAiActionsVisible = useMemo(
    () => (settings ? resolveSourceControlAiEnabled({ settings, repo }) : false),
    [repo, settings]
  )
  const createComposerOpen =
    !activeReview &&
    !isFolder &&
    Boolean(branch) &&
    (hostedReviewCreation?.canCreate === true ||
      hostedReviewCreation?.blockedReason === 'needs_push')

  return { ...context, prCreationDefaults, sourceControlAiActionsVisible, createComposerOpen }
}

export type useChecksPanelGenerationDefaultsState = ReturnType<
  typeof useChecksPanelGenerationDefaults
>
