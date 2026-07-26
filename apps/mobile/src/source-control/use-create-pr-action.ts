import { useMemo } from 'react'

import { buildMobileCreatePrAction } from './create-pr-action'
import type { MobileGitStatusResult } from './git-status'
import { useMobileHostedReviewEligibility } from './use-hosted-review-eligibility'

type Params = {
  client: Parameters<typeof useMobileHostedReviewEligibility>[0]['client']
  connState: Parameters<typeof useMobileHostedReviewEligibility>[0]['connState']
  worktreeId: string
  status: MobileGitStatusResult | null
  hasUncommittedChanges: boolean
  busyAction: string | null
  createPr: (pushFirst: boolean) => void
}

export function useMobileSourceControlCreatePrAction({
  client,
  connState,
  worktreeId,
  status,
  hasUncommittedChanges,
  busyAction,
  createPr
}: Params) {
  const upstream = status?.upstreamStatus
  const eligibilityState = useMobileHostedReviewEligibility({
    client,
    connState,
    worktreeId,
    branch: status?.branch,
    hasUpstream: upstream?.hasUpstream,
    ahead: upstream?.ahead,
    behind: upstream?.behind,
    hasUncommittedChanges
  })

  return useMemo(
    () =>
      buildMobileCreatePrAction({
        branch: status?.branch,
        eligibilityState,
        busyAction,
        onCreatePr: createPr
      }),
    [busyAction, createPr, eligibilityState, status?.branch]
  )
}
