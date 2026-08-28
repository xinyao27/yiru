import type { StateCreator } from 'zustand'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/cache-identity'
import type { AppState } from '~renderer/store/types'

import { capPrRefreshSequences } from './cache-policy'
import { isStaleExactLinkedPRLookup } from './linked-pr-policy'
import { saveGitHubPRCache } from './pr-cache-persistence'
import { applyGitHubPRResultToCaches } from './pr-cache-sync'
import { mergeCachedCheckStatus } from './refresh-check-status'
import {
  applyRefreshLinkedPRClears,
  getRefreshLinkedPRClear,
  type RefreshLinkedPRClear
} from './refresh-linked-pr'
import {
  deletePRRefreshStartedEntry,
  rememberPRRefreshStartedEntry,
  takePRRefreshStartedEntry
} from './refresh-start-entry'
import { capPrRefreshStates, pruneExpiredPRRefreshStates } from './refresh-state'
import { getRefreshAliasExecutionHostId } from './repo-owner'
import type { GitHubSlice } from './store-contract'
import { buildWorktreeLookupIndex, type WorktreeLookupIndex } from './worktree-lookup'

type GitHubRefreshEventActions = Pick<GitHubSlice, 'applyGitHubPRRefreshEvent'>

export function createGitHubRefreshEventActions(
  set: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]
): GitHubRefreshEventActions {
  return {
    applyGitHubPRRefreshEvent: (event) => {
      // Why: the sidebar/left-list refresh for local repos flows through the main
      // PR coordinator (not fetchPRForBranch), so it must run the same guarded
      // clear when main stamps a merged linked PR whose head has diverged.
      const linkedPRClears: RefreshLinkedPRClear[] = []
      let didUpdatePRCache = false
      set((s) => {
        let linkedWorktreeLookupIndex: WorktreeLookupIndex | undefined
        const nextSequences = { ...s.prRefreshSequences }
        const prunedStates = pruneExpiredPRRefreshStates(s.prRefreshStates)
        const nextStates = { ...prunedStates }
        let nextPRCache = s.prCache
        let nextHostedReviewCache = s.hostedReviewCache ?? {}
        let changed = prunedStates !== s.prRefreshStates

        for (const alias of event.aliases) {
          const aliasExecutionHostId = getRefreshAliasExecutionHostId(alias)
          const previousSequence = nextSequences[alias.cacheKey] ?? 0
          if (
            event.outcome ? event.sequence < previousSequence : event.sequence <= previousSequence
          ) {
            if (event.outcome || event.status !== 'in-flight') {
              deletePRRefreshStartedEntry(event.sequence, alias.cacheKey)
            }
            continue
          }
          // Why: delete-then-set moves this key to the end of insertion order so
          // capPrRefreshSequences evicts genuinely idle keys, not active ones.
          delete nextSequences[alias.cacheKey]
          nextSequences[alias.cacheKey] = event.sequence
          changed = true

          if (event.outcome) {
            const requestStartedEntry = takePRRefreshStartedEntry(event.sequence, alias.cacheKey)
            if (previousSequence !== event.sequence) {
              deletePRRefreshStartedEntry(previousSequence, alias.cacheKey)
            }
            delete nextStates[alias.cacheKey]
            if (event.outcome.kind === 'upstream-error') {
              nextStates[alias.cacheKey] = {
                status: 'error',
                reason: event.reason,
                updatedAt: Date.now(),
                message: event.outcome.message
              }
              continue
            }
            const data =
              event.outcome.kind === 'found'
                ? mergeCachedCheckStatus(
                    s,
                    alias,
                    aliasExecutionHostId,
                    event.outcome.pr,
                    event.outcome.fetchedAt
                  )
                : null
            const linkedPRNumber = alias.linkedPRNumber ?? null
            // Why: one coordinator outcome can fan out to many linked aliases.
            // Build one lazy index instead of rescanning all worktrees per alias.
            const worktreeLookupIndex =
              alias.worktreeId && linkedPRNumber != null
                ? (linkedWorktreeLookupIndex ??= buildWorktreeLookupIndex(s))
                : undefined
            // Why: queued local refreshes may finish after the user unlinks an
            // exact PR; those older results must not restore the manual-link UI.
            if (
              isStaleExactLinkedPRLookup(
                s,
                alias.worktreeId,
                linkedPRNumber,
                aliasExecutionHostId,
                worktreeLookupIndex
              )
            ) {
              continue
            }
            if (event.outcome.kind === 'found') {
              // Why: only an event that won the sequence gate above owns metadata
              // side effects; rejected late outcomes must not unlink a newer PR.
              const clear = getRefreshLinkedPRClear(
                s,
                alias,
                aliasExecutionHostId,
                event.outcome.pr,
                worktreeLookupIndex
              )
              if (clear) {
                linkedPRClears.push(clear)
              }
            }
            const nextCaches = applyGitHubPRResultToCaches({
              prCache: nextPRCache,
              hostedReviewCache: nextHostedReviewCache,
              prCacheKey: alias.cacheKey,
              repoPath: alias.repoPath,
              branch: alias.branch,
              settings: s.settings,
              repoId: alias.repoId,
              executionHostId: aliasExecutionHostId,
              hasRepoOwner: true,
              pr: data,
              fetchedAt: event.outcome.fetchedAt,
              state: s,
              worktreeId: alias.worktreeId,
              linkedPRNumber: alias.linkedPRNumber,
              fallbackPRNumber: alias.fallbackPRNumber,
              fallbackPRSource: alias.fallbackPRSource,
              requestStartedAt: event.requestStartedAt,
              requestStartedEntry
            })
            didUpdatePRCache = didUpdatePRCache || nextCaches.prCache !== nextPRCache
            nextPRCache = nextCaches.prCache
            nextHostedReviewCache = nextCaches.hostedReviewCache
            continue
          }

          if (event.status) {
            if (previousSequence !== event.sequence) {
              deletePRRefreshStartedEntry(previousSequence, alias.cacheKey)
            }
            if (event.status === 'in-flight' && event.requestStartedAt !== undefined) {
              const hostedReviewCacheKey = getHostedReviewCacheKey(
                alias.repoPath,
                alias.branch,
                s.settings,
                alias.repoId,
                aliasExecutionHostId,
                true
              )
              rememberPRRefreshStartedEntry(
                event.sequence,
                alias.cacheKey,
                s.hostedReviewCache[hostedReviewCacheKey]
              )
            } else {
              // Why: rate-limit pauses/skips can follow an in-flight broadcast
              // without an outcome; the cached request-start snapshot is no
              // longer live and would otherwise accumulate per refresh sequence.
              deletePRRefreshStartedEntry(event.sequence, alias.cacheKey)
            }
            // Why: delete-then-set moves this key to the end of insertion order so
            // capRecordByInsertionOrder evicts genuinely idle keys, not active ones.
            delete nextStates[alias.cacheKey]
            nextStates[alias.cacheKey] = {
              status: event.status,
              reason: event.reason,
              updatedAt: Date.now(),
              pausedUntil: event.pausedUntil
            }
          }
        }

        return changed
          ? {
              prRefreshSequences: capPrRefreshSequences(nextSequences),
              // Why: bound prRefreshStates too (same unbounded PR-cache-key space),
              // but with status-aware eviction so visible in-progress pills survive.
              prRefreshStates: capPrRefreshStates(nextStates),
              prCache: nextPRCache,
              hostedReviewCache: nextHostedReviewCache
            }
          : {}
      })
      if (didUpdatePRCache && event.outcome && event.outcome.kind !== 'upstream-error') {
        saveGitHubPRCache(get())
      }
      applyRefreshLinkedPRClears(get, linkedPRClears)
    }
  }
}
