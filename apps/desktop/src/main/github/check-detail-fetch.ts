import type { PRCheckRunDetails, GitHubRerunPRChecksResult } from '~shared/types'

import {
  nullableString,
  mapCheckAnnotations,
  mapWorkflowJobs,
  attachFailedJobLogTails,
  getWorkflowRunIdFromCheckRun
} from './check-details'
import { getPRChecks } from './check-fallback'
import {
  ghExecFileAsync,
  acquire,
  release,
  getOwnerRepo,
  classifyGhError,
  ghRepoExecOptions,
  githubRepoContext,
  type LocalGitExecOptions,
  type OwnerRepo
} from './github-cli'

export async function getPRCheckDetails(
  repoPath: string,
  args: {
    checkRunId?: number
    workflowRunId?: number
    checkName?: string
    url?: string | null
    prRepo?: OwnerRepo | null
  },
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<PRCheckRunDetails | null> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = args.prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  if (!ownerRepo) {
    return null
  }

  await acquire()
  try {
    let checkRun: Record<string, unknown> | null = null
    let annotations: PRCheckRunDetails['annotations'] = []
    if (args.checkRunId) {
      const { stdout } = await ghExecFileAsync(
        ['api', `repos/${ownerRepo.owner}/${ownerRepo.repo}/check-runs/${args.checkRunId}`],
        ghOptions
      )
      checkRun = JSON.parse(stdout) as Record<string, unknown>
      try {
        const annotationsResult = await ghExecFileAsync(
          [
            'api',
            `repos/${ownerRepo.owner}/${ownerRepo.repo}/check-runs/${args.checkRunId}/annotations?per_page=20`
          ],
          ghOptions
        )
        annotations = mapCheckAnnotations(JSON.parse(annotationsResult.stdout))
      } catch (err) {
        console.warn('getPRCheckDetails annotations fetch failed:', err)
      }
    }

    const workflowRunId = args.workflowRunId ?? getWorkflowRunIdFromCheckRun(checkRun)
    let jobs: PRCheckRunDetails['jobs'] = []
    if (workflowRunId) {
      try {
        const { stdout } = await ghExecFileAsync(
          [
            'api',
            `repos/${ownerRepo.owner}/${ownerRepo.repo}/actions/runs/${workflowRunId}/jobs?per_page=100`
          ],
          ghOptions
        )
        jobs = mapWorkflowJobs(JSON.parse(stdout), args.checkName)
        await attachFailedJobLogTails(jobs, ownerRepo, ghOptions)
      } catch (err) {
        console.warn('getPRCheckDetails workflow jobs fetch failed:', err)
      }
    }

    const output =
      checkRun?.output && typeof checkRun.output === 'object'
        ? (checkRun.output as Record<string, unknown>)
        : null
    return {
      name: nullableString(checkRun?.name) ?? args.checkName ?? 'Check',
      status: nullableString(checkRun?.status),
      conclusion: nullableString(checkRun?.conclusion),
      url: nullableString(checkRun?.html_url) ?? args.url ?? null,
      detailsUrl: nullableString(checkRun?.details_url) ?? args.url ?? null,
      startedAt: nullableString(checkRun?.started_at),
      completedAt: nullableString(checkRun?.completed_at),
      title: nullableString(output?.title),
      summary: nullableString(output?.summary),
      text: nullableString(output?.text),
      annotations,
      jobs
    }
  } catch (err) {
    console.warn('getPRCheckDetails failed:', err)
    return null
  } finally {
    release()
  }
}

export function parseActionsRunId(url: string | null | undefined): number | undefined {
  if (!url) {
    return undefined
  }
  const match = /\/actions\/runs\/(\d+)(?:\/|$)/.exec(url)
  if (!match) {
    return undefined
  }
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : undefined
}

export async function rerunPRChecks(
  repoPath: string,
  prNumber: number,
  options: { headSha?: string; failedOnly?: boolean } = {},
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubRerunPRChecksResult> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = await getOwnerRepo(repoPath, connectionId, localGitOptions)
  if (!ownerRepo) {
    return { ok: false, error: 'Could not resolve GitHub owner/repo for this repository' }
  }

  const checks = await getPRChecks(
    repoPath,
    prNumber,
    options.headSha,
    ownerRepo,
    { noCache: true },
    connectionId,
    localGitOptions
  )
  const candidates = options.failedOnly
    ? checks.filter((check) =>
        ['failure', 'cancelled', 'timed_out'].includes(check.conclusion ?? '')
      )
    : checks
  const workflowRunIds = new Set(
    candidates
      .map((check) => check.workflowRunId ?? parseActionsRunId(check.url))
      .filter((id): id is number => typeof id === 'number')
  )
  const checkRunIds = new Set(
    candidates
      .filter((check) => !check.workflowRunId && !parseActionsRunId(check.url))
      .map((check) => check.checkRunId)
      .filter((id): id is number => typeof id === 'number')
  )

  if (workflowRunIds.size === 0 && checkRunIds.size === 0) {
    return {
      ok: false,
      error: options.failedOnly
        ? 'No failed GitHub Actions checks to rerun.'
        : 'No rerunnable checks found.'
    }
  }

  let count = 0
  await acquire()
  try {
    for (const runId of workflowRunIds) {
      const endpoint = options.failedOnly
        ? `repos/${ownerRepo.owner}/${ownerRepo.repo}/actions/runs/${runId}/rerun-failed-jobs`
        : `repos/${ownerRepo.owner}/${ownerRepo.repo}/actions/runs/${runId}/rerun`
      await ghExecFileAsync(['api', '-X', 'POST', endpoint], {
        ...ghOptions,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' }
      })
      count += 1
    }
    for (const checkRunId of checkRunIds) {
      await ghExecFileAsync(
        [
          'api',
          '-X',
          'POST',
          `repos/${ownerRepo.owner}/${ownerRepo.repo}/check-runs/${checkRunId}/rerequest`
        ],
        { ...ghOptions, env: { ...process.env, GH_PROMPT_DISABLED: '1' } }
      )
      count += 1
    }
    return { ok: true, count }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
    return { ok: false, error: classifyGhError(message).message }
  } finally {
    release()
  }
}

// Why: review thread resolution status and thread IDs are only available via
// GraphQL. The REST pulls/{n}/comments endpoint does not expose them, so we
// use GraphQL for review threads and REST for PR conversation comments.
