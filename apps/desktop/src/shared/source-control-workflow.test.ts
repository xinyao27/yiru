import {
  interpretSourceControlHostedReviewCreateResult,
  isBehindOnlyUpstream,
  resolveCreateReviewIntentEligibility,
  resolveSourceControlCommitAreaPrimaryActionDecision,
  resolveSourceControlPrimaryActionDecision,
  resolveSourceControlOperationFollowUp,
  resolveSourceControlRemoteOperationFailureOutcome,
  resolveSourceControlReviewRemoteStep,
  resolveSourceControlSyncAfterPull,
  resolveSourceControlSyncStart,
  type SourceControlPrimaryActionDecisionInputs
} from '@yiru/workbench-model/review'
import { describe, expect, it } from 'vite-plus/test'

import { resolveSourceControlOperationOwner } from './source-control-operation-owner'
import type { Repo, Worktree } from './types'

function primaryActionInputs(
  overrides: Partial<SourceControlPrimaryActionDecisionInputs> = {}
): SourceControlPrimaryActionDecisionInputs {
  return {
    stagedCount: 0,
    hasUnstagedChanges: false,
    hasStageableChanges: false,
    hasMessage: false,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: { hasUpstream: true, ahead: 0, behind: 0 },
    ...overrides
  }
}

describe('source-control workflow', () => {
  it('keeps conflict, commit, and remote-action priority in one decision ladder', () => {
    expect(
      resolveSourceControlCommitAreaPrimaryActionDecision(
        primaryActionInputs({
          stagedCount: 1,
          hasMessage: true,
          hasUnresolvedConflicts: true
        })
      )
    ).toMatchObject({
      kind: 'commit',
      disabled: true,
      titleIntent: 'resolve_conflicts_before_commit'
    })

    expect(
      resolveSourceControlCommitAreaPrimaryActionDecision(
        primaryActionInputs({ stagedCount: 1, hasMessage: true })
      )
    ).toMatchObject({ kind: 'commit', disabled: false })

    expect(
      resolveSourceControlCommitAreaPrimaryActionDecision(
        primaryActionInputs({ upstreamStatus: { hasUpstream: true, ahead: 2, behind: 1 } })
      )
    ).toMatchObject({ kind: 'sync', ahead: 2, behind: 1 })

    expect(
      resolveSourceControlCommitAreaPrimaryActionDecision(
        primaryActionInputs({
          hostedReviewCreation: {
            provider: 'github',
            review: null,
            canCreate: true,
            blockedReason: null,
            nextAction: null
          },
          isReviewIntentInFlight: true
        })
      )
    ).toMatchObject({ kind: 'commit', disabled: true })
  })

  it('uses lease-protected push for patch-equivalent divergence across clients', () => {
    const divergence = {
      hasUpstream: true,
      upstreamName: 'origin/topic',
      ahead: 2,
      behind: 2,
      behindCommitsArePatchEquivalent: true
    }

    expect(resolveSourceControlSyncStart(divergence)).toBe('force_push')
    expect(
      resolveSourceControlCommitAreaPrimaryActionDecision(
        primaryActionInputs({ upstreamStatus: divergence, branchCommitsAhead: 2 })
      )
    ).toMatchObject({ kind: 'push', requiresForceWithLease: true, count: 2 })
    expect(resolveSourceControlSyncAfterPull({ ...divergence, ahead: 0 })).toBe('complete')
  })

  it('drives review prerequisites, refresh, and rejected-push recovery semantically', () => {
    expect(
      resolveSourceControlReviewRemoteStep({
        upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 },
        hostedReviewCreation: { canCreate: false, blockedReason: 'no_upstream' },
        branchCommitsAhead: 1
      })
    ).toBe('publish')
    expect(
      resolveSourceControlReviewRemoteStep({
        upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 },
        hostedReviewCreation: { canCreate: false, blockedReason: 'no_upstream' }
      })
    ).toBe('blocked')
    expect(
      resolveSourceControlReviewRemoteStep({
        upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 },
        hostedReviewCreation: { canCreate: false, blockedReason: 'no_upstream' },
        allowPublishWhenCommitCountUnknown: true
      })
    ).toBe('publish')

    const behindOnly = { hasUpstream: true, ahead: 0, behind: 2 }
    expect(isBehindOnlyUpstream(behindOnly)).toBe(true)
    expect(
      resolveCreateReviewIntentEligibility({
        stagedCount: 0,
        hasStageableChanges: false,
        hasMessage: false,
        hasUnresolvedConflicts: false,
        upstreamStatus: behindOnly,
        hostedReviewCreation: {
          provider: 'gitlab',
          review: null,
          canCreate: false,
          blockedReason: 'needs_sync',
          nextAction: 'sync'
        }
      })
    ).toEqual({ eligible: true, kind: 'needs_sync' })
    expect(
      resolveSourceControlPrimaryActionDecision(
        primaryActionInputs({
          upstreamStatus: behindOnly,
          hostedReviewCreation: {
            provider: 'gitlab',
            review: null,
            canCreate: false,
            blockedReason: 'needs_sync',
            nextAction: 'sync'
          }
        })
      )
    ).toMatchObject({ kind: 'create_review_intent', disabled: false })
    expect(
      resolveSourceControlReviewRemoteStep({
        upstreamStatus: behindOnly,
        hostedReviewCreation: { canCreate: false, blockedReason: 'needs_sync' }
      })
    ).toBe('fast_forward')
    expect(
      resolveSourceControlReviewRemoteStep({
        upstreamStatus: { hasUpstream: true, ahead: 1, behind: 2 },
        hostedReviewCreation: { canCreate: false, blockedReason: 'needs_sync' }
      })
    ).toBe('blocked')

    expect(
      resolveSourceControlOperationFollowUp({ operation: 'push', outcome: 'rejected_push' })
    ).toEqual({
      statusRefresh: 'preserve_previous',
      refreshHostedReview: false,
      recovery: 'fetch_then_refresh_upstream'
    })

    expect(
      resolveSourceControlOperationFollowUp({
        operation: 'sync',
        outcome: 'succeeded',
        syncPushed: true
      })
    ).toMatchObject({
      statusRefresh: 'preserve_previous',
      refreshHostedReview: true,
      recovery: null
    })
    expect(
      resolveSourceControlOperationFollowUp({ operation: 'pull', outcome: 'rejected_push' })
    ).toMatchObject({ statusRefresh: null, refreshHostedReview: false, recovery: null })
    expect(
      resolveSourceControlOperationFollowUp({ operation: 'sync', outcome: 'rejected_push' })
    ).toMatchObject({ recovery: 'fetch_then_refresh_upstream' })
    const rejected = new Error('updates were rejected (non-fast-forward)')
    expect(
      resolveSourceControlRemoteOperationFailureOutcome({
        operation: 'sync',
        error: rejected,
        isPushStage: true
      })
    ).toBe('rejected_push')
    expect(
      resolveSourceControlRemoteOperationFailureOutcome({
        operation: 'sync',
        error: rejected,
        isPushStage: false
      })
    ).toBe('failed')
    expect(
      resolveSourceControlRemoteOperationFailureOutcome({
        operation: 'push',
        error: new Error('A submodule has remote changes')
      })
    ).toBe('rejected_push')
    expect(
      resolveSourceControlRemoteOperationFailureOutcome({
        operation: 'push',
        error: new Error('The provider has remote changes disabled')
      })
    ).toBe('failed')
  })

  it('normalizes created, existing, and failed review results for both adapters', () => {
    expect(
      interpretSourceControlHostedReviewCreateResult({
        ok: true,
        number: 42,
        url: 'https://review/42'
      })
    ).toEqual({ kind: 'created', number: 42, url: 'https://review/42' })
    expect(
      interpretSourceControlHostedReviewCreateResult({
        ok: false,
        code: 'already_exists',
        error: 'already open',
        existingReview: { number: 7, url: 'https://review/7' }
      })
    ).toEqual({ kind: 'existing', number: 7, url: 'https://review/7', error: 'already open' })
    expect(
      interpretSourceControlHostedReviewCreateResult({
        ok: false,
        code: 'auth_required',
        error: 'sign in first'
      })
    ).toEqual({ kind: 'failed', code: 'auth_required', error: 'sign in first' })
  })

  it('refreshes the exact operation host and rejects ambiguous legacy ownership', () => {
    const localRepo = {
      id: 'repo',
      path: 'local-repo',
      displayName: 'Local repo',
      badgeColor: 'blue',
      addedAt: 1,
      executionHostId: 'local'
    } satisfies Repo
    const runtimeRepo = {
      id: 'repo',
      path: 'runtime-repo',
      displayName: 'Runtime repo',
      badgeColor: 'green',
      addedAt: 2,
      executionHostId: 'runtime:env'
    } satisfies Repo
    const localWorktree = {
      id: 'repo::worktree',
      repoId: 'repo',
      path: 'same-worktree-path',
      hostId: 'local',
      displayName: 'Worktree',
      comment: '',
      linkedPR: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      head: 'abc123',
      branch: 'topic',
      isBare: false,
      isMainWorktree: false
    } satisfies Worktree
    const runtimeWorktree = {
      ...localWorktree,
      hostId: 'runtime:env'
    } satisfies Worktree
    const target = {
      worktreeId: localWorktree.id,
      worktreePath: localWorktree.path,
      runtimeSettings: { activeRuntimeEnvironmentId: 'env' }
    }

    expect(
      resolveSourceControlOperationOwner(
        {
          repos: [localRepo, runtimeRepo],
          worktreesByRepo: { local: [localWorktree], runtime: [runtimeWorktree] }
        },
        target
      )
    ).toMatchObject({
      repo: runtimeRepo,
      worktree: runtimeWorktree,
      executionHostId: 'runtime:env'
    })
    expect(
      resolveSourceControlOperationOwner(
        {
          repos: [localRepo, runtimeRepo],
          worktreesByRepo: { legacy: [{ ...localWorktree, hostId: undefined }] }
        },
        target
      )
    ).toBeNull()
  })
})
