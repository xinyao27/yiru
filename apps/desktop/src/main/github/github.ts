import { resolve } from 'node:path'

import { appStarSourceSchema } from '~shared/gh-star-source'
import type {
  Repo,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult,
  GitHubPRRefreshReason,
  PRRefreshOutcome
} from '~shared/types'

import type { Store } from '../persistence'
import type { StatsCollector } from '../stats/collector'
import { track } from '../telemetry/client'
import { getCohortAtEmit } from '../telemetry/cohort-classifier'
import { getAuthenticatedViewer, checkYiruStarred, starYiru } from './client'
import {
  clearVisiblePRRefreshWindow,
  enqueuePRRefresh,
  reportVisiblePRRefreshCandidates,
  setPRRefreshOutcomeObserver,
  setPRRefreshShellAdapter,
  type PRRefreshShellAdapter
} from './pr-refresh-coordinator'
import { validateAutomaticPRRefreshCandidate } from './repo-validation'

const prRefreshVisibilityCleanupRegistered = new Set<number>()

type ShellGitHubService = ReturnType<typeof createShellGitHubService>

let shellGitHubService: ShellGitHubService | null = null

export function initializeShellGitHubService(
  shellAdapter: PRRefreshShellAdapter,
  store: Store,
  stats: StatsCollector
): void {
  shellGitHubService = createShellGitHubService(shellAdapter, store, stats)
}

export function getShellGitHubService(): ShellGitHubService {
  if (!shellGitHubService) {
    throw new Error('shell_github_service_unavailable')
  }
  return shellGitHubService
}

function createShellGitHubService(
  shellAdapter: PRRefreshShellAdapter,
  store: Store,
  stats: StatsCollector
) {
  setPRRefreshShellAdapter(shellAdapter)

  function recordPRIfNeeded(repo: Repo, outcome: PRRefreshOutcome): void {
    if (outcome.kind === 'found' && !stats.hasCountedPR(outcome.pr.url)) {
      stats.record({
        type: 'pr_created',
        at: Date.now(),
        repoId: repo.id,
        meta: { prNumber: outcome.pr.number, prUrl: outcome.pr.url }
      })
    }
  }

  setPRRefreshOutcomeObserver((candidate, outcome) => {
    const repo =
      store.getRepos().find((r) => r.id === candidate.repoId) ??
      store.getRepos().find((r) => resolve(r.path) === resolve(candidate.repoPath))
    if (repo) {
      recordPRIfNeeded(repo, outcome)
    }
  })

  const enqueueRefresh = (
    rendererId: number,
    args: {
      candidate: GitHubPRRefreshCandidate
      reason: GitHubPRRefreshReason
      priority?: number
    }
  ): GitHubPRRefreshEnqueueResult => {
    const validation = validateAutomaticPRRefreshCandidate(args.candidate, store)
    if (validation.kind === 'skipped') {
      return validation.result
    }
    enqueuePRRefresh(validation.candidate, args.reason, args.priority ?? 0, rendererId)
    return { kind: 'queued' }
  }

  const reportVisible = (
    rendererId: number,
    args: { candidates: GitHubPRRefreshCandidate[]; generation: number }
  ): boolean => {
    const senderId = rendererId
    if (!prRefreshVisibilityCleanupRegistered.has(senderId)) {
      prRefreshVisibilityCleanupRegistered.add(senderId)
      shellAdapter.onRendererDestroyed(senderId, () => {
        prRefreshVisibilityCleanupRegistered.delete(senderId)
        clearVisiblePRRefreshWindow(senderId)
      })
    }
    const candidates: GitHubPRRefreshCandidate[] = []
    const repos = store.getRepos()
    for (const candidate of args.candidates) {
      const validation = validateAutomaticPRRefreshCandidate(candidate, store, repos)
      if (validation.kind === 'ok') {
        candidates.push(validation.candidate)
      }
    }
    reportVisiblePRRefreshCandidates(candidates, args.generation, senderId)
    return true
  }

  // Star operations target the Yiru repo itself — no repoPath validation needed
  const star = async (source: unknown): Promise<boolean> => {
    const sourceParse = appStarSourceSchema.safeParse(source)
    const starred = await starYiru()
    if (starred && sourceParse.success) {
      // Why: this main-owned event bypasses renderer telemetry IPC, so cohort
      // context must be attached here on the successful star path.
      track('app_starred_yiru', {
        source: sourceParse.data,
        ...getCohortAtEmit()
      })
    }
    return starred
  }

  return {
    viewer: getAuthenticatedViewer,
    enqueuePRRefresh: enqueueRefresh,
    reportVisiblePRRefreshCandidates: reportVisible,
    checkYiruStarred,
    starYiru: star
  }
}
