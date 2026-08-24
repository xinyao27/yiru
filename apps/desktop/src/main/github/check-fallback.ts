import type { PRCheckDetail } from '~shared/types'

import { parseActionsRunId } from './check-detail-fetch'
import { getPendingApprovalCheckSuiteName, getPendingApprovalCheckSuiteUrl } from './check-details'
import type {
  GraphQLPRChecksResponse,
  RestCheckRun,
  RestCommitStatus,
  RestCheckSuite
} from './check-rollup'
import {
  PR_CHECKS_ROLLUP_QUERY,
  mapRestCheckRun,
  mapRestCommitStatus,
  mapGraphQLPRChecksResponse
} from './check-rollup'
import type { GhExecOptions } from './client-foundation'
import { assertRateLimitBudget } from './client-foundation'
import {
  ghExecFileAsync,
  ghRepoExecOptions,
  extractExecError,
  acquire,
  release,
  getOwnerRepo,
  githubRepoContext,
  type LocalGitExecOptions,
  type OwnerRepo
} from './github-cli'
import { mapCheckStatus, mapCheckConclusion } from './mappers'
import { noteRateLimitSpend } from './rate-limit'

export async function getPRChecksViaRestFallback(
  ownerRepo: OwnerRepo,
  headSha: string | undefined,
  ghOptions: GhExecOptions,
  noCache?: boolean
): Promise<PRCheckDetail[] | null> {
  if (!headSha) {
    return null
  }
  try {
    await assertRateLimitBudget('core')
  } catch (err) {
    console.warn('getPRChecks skipped REST fallback, falling back to gh pr checks:', err)
    return null
  }

  await acquire()
  try {
    const cacheArgs = noCache ? [] : ['--cache', '60s']
    const encodedHeadSha = encodeURIComponent(headSha)
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        ...cacheArgs,
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/commits/${encodedHeadSha}/check-runs?per_page=100`
      ],
      ghOptions
    )
    noteRateLimitSpend('core')
    const checkRunData = JSON.parse(stdout) as {
      check_runs?: RestCheckRun[]
    }
    const checkRuns = (checkRunData.check_runs ?? []).map(mapRestCheckRun)
    const checkRunNames = new Set(checkRuns.map((check) => check.name))

    let legacyStatuses: PRCheckDetail[] = []
    try {
      const statusResult = await ghExecFileAsync(
        [
          'api',
          ...cacheArgs,
          `repos/${ownerRepo.owner}/${ownerRepo.repo}/commits/${encodedHeadSha}/status?per_page=100`
        ],
        ghOptions
      )
      noteRateLimitSpend('core')
      const statusData = JSON.parse(statusResult.stdout) as {
        statuses?: RestCommitStatus[]
      }
      legacyStatuses = (statusData.statuses ?? [])
        .map(mapRestCommitStatus)
        .filter((check): check is PRCheckDetail => check !== null && !checkRunNames.has(check.name))
    } catch (err) {
      ghOptions.signal?.throwIfAborted()
      // Why: the REST fallback is already degraded; keep richer check-run rows
      // if the legacy-status enrichment fails.
      console.warn('getPRChecks REST status fallback failed:', err)
    }

    let pendingApprovalChecks: PRCheckDetail[] = []
    try {
      const suitesResult = await ghExecFileAsync(
        [
          'api',
          ...cacheArgs,
          `repos/${ownerRepo.owner}/${ownerRepo.repo}/commits/${encodedHeadSha}/check-suites?per_page=100`
        ],
        ghOptions
      )
      noteRateLimitSpend('core')
      const suitesData = JSON.parse(suitesResult.stdout) as {
        check_suites?: RestCheckSuite[]
      }
      pendingApprovalChecks = (suitesData.check_suites ?? [])
        .filter((suite) => suite.conclusion?.toLowerCase() === 'action_required')
        .map((suite, index) => ({
          name: getPendingApprovalCheckSuiteName(suite, headSha, index),
          status: 'completed' as const,
          conclusion: 'action_required' as const,
          url: getPendingApprovalCheckSuiteUrl(ownerRepo, headSha, suite.id)
        }))
    } catch (err) {
      ghOptions.signal?.throwIfAborted()
      console.warn('getPRChecks REST check-suite fallback failed:', err)
    }

    const checks = [...checkRuns, ...legacyStatuses, ...pendingApprovalChecks]
    return checks.length > 0 ? checks : null
  } catch (err) {
    ghOptions.signal?.throwIfAborted()
    console.warn('getPRChecks via REST fallback failed, falling back to gh pr checks:', err)
    return null
  } finally {
    release()
  }
}

/**
 * Get detailed check statuses for a PR.
 * Uses GitHub's combined GraphQL rollup so check runs and legacy commit statuses
 * arrive in one cached request; suite-only approval blockers are included too.
 */
export async function getPRChecks(
  repoPath: string,
  prNumber: number,
  headSha?: string,
  prRepo?: OwnerRepo | null,
  options?: { noCache?: boolean; signal?: AbortSignal },
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<PRCheckDetail[]> {
  void headSha
  const ghOptions: GhExecOptions = {
    ...ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions)),
    ...(options?.signal ? { signal: options.signal } : {})
  }
  options?.signal?.throwIfAborted()
  const ownerRepo = prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  options?.signal?.throwIfAborted()
  const fallbackToPRChecks = async (): Promise<PRCheckDetail[]> => {
    await assertRateLimitBudget('graphql')
    await acquire()
    try {
      const fallbackArgs = ['pr', 'checks', String(prNumber), '--json', 'name,state,link']
      if (ownerRepo) {
        fallbackArgs.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
      }
      const { stdout } = await ghExecFileAsync(fallbackArgs, ghOptions).catch((err: unknown) => {
        const { stderr } = extractExecError(err)
        // Why: `gh pr checks` exits non-zero when a PR genuinely has no check
        // runs yet. Treat that as an empty optional section, not a load failure.
        if (stderr.toLowerCase().includes('no checks reported')) {
          return { stdout: '[]', stderr }
        }
        throw err
      })
      noteRateLimitSpend('graphql')
      const data = JSON.parse(stdout) as { name: string; state: string; link: string }[]
      return data.map((d) => ({
        name: d.name,
        status: mapCheckStatus(d.state),
        conclusion: mapCheckConclusion(d.state),
        url: d.link || null,
        workflowRunId: parseActionsRunId(d.link)
      }))
    } finally {
      release()
    }
  }

  if (ownerRepo) {
    let canUseGraphQLRollup = true
    try {
      await assertRateLimitBudget('graphql')
    } catch (err) {
      canUseGraphQLRollup = false
      console.warn('getPRChecks skipped GraphQL rollup, falling back to gh pr checks:', err)
    }
    if (canUseGraphQLRollup) {
      await acquire()
      try {
        // Why: --cache 60s saves rate-limit budget during polling, but when the
        // user explicitly clicks refresh we must skip it so gh fetches fresh data.
        const cacheArgs = options?.noCache ? [] : ['--cache', '60s']
        const { stdout } = await ghExecFileAsync(
          [
            'api',
            'graphql',
            ...cacheArgs,
            '-f',
            `owner=${ownerRepo.owner}`,
            '-f',
            `repo=${ownerRepo.repo}`,
            '-F',
            `pr=${prNumber}`,
            '-f',
            `query=${PR_CHECKS_ROLLUP_QUERY}`
          ],
          ghOptions
        )
        noteRateLimitSpend('graphql')
        const checks = mapGraphQLPRChecksResponse(
          ownerRepo,
          JSON.parse(stdout) as GraphQLPRChecksResponse
        )
        if (checks !== null) {
          return checks
        }
      } catch (err) {
        options?.signal?.throwIfAborted()
        // Why: if GitHub's richer rollup query is unavailable, the older gh
        // command still returns the combined check/status list for display.
        console.warn('getPRChecks via GraphQL rollup failed, falling back to gh pr checks:', err)
      } finally {
        release()
      }
    }
    const restChecks = await getPRChecksViaRestFallback(
      ownerRepo,
      headSha,
      ghOptions,
      options?.noCache
    )
    if (restChecks !== null) {
      return restChecks
    }
  }

  try {
    return await fallbackToPRChecks()
  } catch (err) {
    console.warn('getPRChecks failed:', err)
    throw err
  }
}
