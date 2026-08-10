import { resolve } from 'node:path'

import { appStarSourceSchema } from '~shared/gh-star-source'
import type {
  Repo,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult,
  GitHubPRRefreshReason,
  PRRefreshOutcome
} from '~shared/types'

import type { MainIpcRegistration } from '../ipc-registration'
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

export function registerGitHubShellHandlers(
  ipcMain: MainIpcRegistration,
  shellAdapter: PRRefreshShellAdapter,
  store: Store,
  stats: StatsCollector
): void {
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

  ipcMain.handle(
    'gh:enqueuePRRefresh',
    (
      event,
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
      const senderWindowId = event?.sender?.id
      enqueuePRRefresh(validation.candidate, args.reason, args.priority ?? 0, senderWindowId)
      return { kind: 'queued' }
    }
  )

  ipcMain.handle(
    'gh:reportVisiblePRRefreshCandidates',
    (event, args: { candidates: GitHubPRRefreshCandidate[]; generation: number }) => {
      const senderId = event.sender.id
      if (!prRefreshVisibilityCleanupRegistered.has(senderId)) {
        prRefreshVisibilityCleanupRegistered.add(senderId)
        event.sender.once('destroyed', () => {
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
  )

  // Star operations target the Yiru repo itself — no repoPath validation needed
  ipcMain.handle('gh:viewer', () => getAuthenticatedViewer())
  ipcMain.handle('gh:checkYiruStarred', () => checkYiruStarred())
  ipcMain.handle('gh:starYiru', async (_event, source: unknown) => {
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
  })
}
