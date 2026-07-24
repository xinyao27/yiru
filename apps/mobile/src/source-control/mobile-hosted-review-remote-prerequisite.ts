import { resolveSourceControlReviewRemoteStep } from '@yiru/workbench-model/review'
import type { SourceControlRemoteOpKind } from '@yiru/workbench-model/review'

import type { RpcClient } from '../transport/rpc-client'
import type { MobileGitStatusResult } from './mobile-git-status'
import type { MobileHostedReviewCreateIntentProgress } from './mobile-hosted-review-create-intent'
import { sendMobileHostedReviewGitMutation } from './mobile-hosted-review-git-preparation'
import type { MobilePrPrefill } from './mobile-pr-create'

type RemotePrerequisiteInput = {
  status: MobileGitStatusResult | null
  onProgress?: (progress: MobileHostedReviewCreateIntentProgress) => void
}

type RemotePrerequisiteResult =
  | { ok: true; ran: boolean }
  | { ok: false; error: string; remoteOperation: SourceControlRemoteOpKind }

export async function applyMobileHostedReviewRemotePrerequisite(
  client: Pick<RpcClient, 'sendRequest'>,
  worktreeId: string,
  prefill: MobilePrPrefill,
  input: RemotePrerequisiteInput
): Promise<RemotePrerequisiteResult> {
  const remoteStep = resolveSourceControlReviewRemoteStep({
    upstreamStatus: input.status?.upstreamStatus,
    hostedReviewCreation: prefill,
    // Mobile historically attempts publish when compare counts are unavailable;
    // the paired runtime remains the authority on whether HEAD is publishable.
    allowPublishWhenCommitCountUnknown: true
  })
  switch (remoteStep) {
    case 'publish': {
      input.onProgress?.('publishing')
      const result = await sendMobileHostedReviewGitMutation(
        client,
        'git.push',
        { worktree: `id:${worktreeId}`, publish: true },
        'Failed to publish branch'
      )
      return result.ok ? { ok: true, ran: true } : { ...result, remoteOperation: 'publish' }
    }
    case 'push': {
      input.onProgress?.('pushing')
      const result = await sendMobileHostedReviewGitMutation(
        client,
        'git.push',
        { worktree: `id:${worktreeId}` },
        'Failed to push commits'
      )
      return result.ok ? { ok: true, ran: true } : { ...result, remoteOperation: 'push' }
    }
    case 'force_push': {
      input.onProgress?.('force_pushing')
      const result = await sendMobileHostedReviewGitMutation(
        client,
        'git.push',
        { worktree: `id:${worktreeId}`, forceWithLease: true },
        'Failed to force push with lease'
      )
      return result.ok ? { ok: true, ran: true } : { ...result, remoteOperation: 'force_push' }
    }
    case 'fast_forward': {
      input.onProgress?.('fast_forwarding')
      const result = await sendMobileHostedReviewGitMutation(
        client,
        'git.fastForward',
        { worktree: `id:${worktreeId}` },
        'Failed to update branch'
      )
      return result.ok ? { ok: true, ran: true } : { ...result, remoteOperation: 'fast_forward' }
    }
    case 'blocked':
    case 'none':
      return { ok: true, ran: false }
  }
}
