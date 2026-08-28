import type { PRCheckRunDetails } from '@yiru/runtime-protocol/workbench/types'

import { sliceCheckLogTail } from './check-job-log-tail-slice'
import type { GhExecOptions } from './client-foundation'
import {
  PR_CHECK_LOG_TAIL_JOB_LIMIT,
  prCheckLogTailCache,
  setPrCheckLogTailCache
} from './client-foundation'
import { ghExecFileAsync, type OwnerRepo } from './github-cli'

export function getPendingApprovalCheckSuiteName(
  suite: {
    id?: number | null
    databaseId?: number | null
    app?: { name?: string | null; slug?: string | null } | null
  },
  headSha: string | null | undefined,
  index: number
): string {
  const appName = suite.app?.name ?? suite.app?.slug ?? null
  const rawSuiteId = suite.databaseId ?? suite.id
  const suiteId =
    typeof rawSuiteId === 'number' && Number.isFinite(rawSuiteId) ? `#${rawSuiteId}` : null
  if (appName && suiteId) {
    return `${appName} ${suiteId}`
  }
  if (appName) {
    return appName
  }
  if (suiteId) {
    return suiteId
  }
  return `${headSha?.slice(0, 12) ?? 'check-suite'}:${index + 1}`
}

export function getPendingApprovalCheckSuiteUrl(
  ownerRepo: OwnerRepo,
  headSha: string,
  suiteId: number | null | undefined
): string {
  const base = `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}/commits/${headSha}/checks`
  return typeof suiteId === 'number' && Number.isFinite(suiteId)
    ? `${base}#check-suite-${suiteId}`
    : base
}

export function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function mapCheckAnnotations(raw: unknown): PRCheckRunDetails['annotations'] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter((annotation): annotation is Record<string, unknown> => Boolean(annotation))
    .map((annotation) => ({
      path: nullableString(annotation.path),
      startLine: nullableNumber(annotation.start_line),
      endLine: nullableNumber(annotation.end_line),
      annotationLevel: nullableString(annotation.annotation_level),
      title: nullableString(annotation.title),
      message: nullableString(annotation.message) ?? '',
      rawDetails: nullableString(annotation.raw_details)
    }))
}

export function mapWorkflowJobs(raw: unknown, checkName?: string): PRCheckRunDetails['jobs'] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { jobs?: unknown }).jobs)) {
    return []
  }
  const jobs = (raw as { jobs: unknown[] }).jobs
    .filter((job): job is Record<string, unknown> => Boolean(job))
    .map((job) => ({
      id: nullableNumber(job.id),
      name: nullableString(job.name) ?? 'Unnamed job',
      status: nullableString(job.status),
      conclusion: nullableString(job.conclusion),
      startedAt: nullableString(job.started_at),
      completedAt: nullableString(job.completed_at),
      url: nullableString(job.html_url),
      logTail: null,
      steps: Array.isArray(job.steps)
        ? job.steps
            .filter((step): step is Record<string, unknown> => Boolean(step))
            .map((step) => ({
              name: nullableString(step.name) ?? 'Unnamed step',
              status: nullableString(step.status),
              conclusion: nullableString(step.conclusion),
              startedAt: nullableString(step.started_at),
              completedAt: nullableString(step.completed_at)
            }))
        : []
    }))
  const exactMatches = checkName ? jobs.filter((job) => job.name === checkName) : []
  return exactMatches.length > 0 ? exactMatches : jobs
}

export function isCheckJobFailureState(state: string | null | undefined): boolean {
  return (
    state === 'failure' ||
    state === 'failed' ||
    state === 'action_required' ||
    state === 'cancelled' ||
    state === 'stale' ||
    state === 'startup_failure' ||
    state === 'timed_out'
  )
}

export function getCheckJobLogTailCacheKey(job: PRCheckRunDetails['jobs'][number]): string | null {
  if (job.id === null) {
    return null
  }
  return `${job.id}:${job.completedAt ?? ''}`
}

export async function attachFailedJobLogTails(
  jobs: PRCheckRunDetails['jobs'],
  ownerRepo: OwnerRepo,
  ghOptions: GhExecOptions
): Promise<void> {
  const failedJobs = jobs
    .filter((job) => {
      const state = job.conclusion ?? job.status
      return job.id !== null && isCheckJobFailureState(state)
    })
    .slice(0, PR_CHECK_LOG_TAIL_JOB_LIMIT)

  // Why: failed workflows can have many jobs; cap log fetches so details remain
  // a lazy, bounded follow-up request instead of a burst of hosted log downloads.
  for (const job of failedJobs) {
    const cacheKey = getCheckJobLogTailCacheKey(job)
    if (!cacheKey) {
      continue
    }
    if (prCheckLogTailCache.has(cacheKey)) {
      job.logTail = prCheckLogTailCache.get(cacheKey) ?? null
      continue
    }
    try {
      const { stdout } = await ghExecFileAsync(
        ['api', `repos/${ownerRepo.owner}/${ownerRepo.repo}/actions/jobs/${job.id}/logs`],
        ghOptions
      )
      job.logTail = sliceCheckLogTail(stdout)
    } catch (err) {
      console.warn('getPRCheckDetails workflow job log fetch failed:', err)
      job.logTail = null
    }
    setPrCheckLogTailCache(cacheKey, job.logTail)
  }
}

export function getWorkflowRunIdFromCheckRun(
  checkRun: Record<string, unknown> | null
): number | undefined {
  const checkSuite = checkRun?.check_suite
  if (!checkSuite || typeof checkSuite !== 'object') {
    return undefined
  }
  const workflowRun = (checkSuite as { workflow_run?: unknown }).workflow_run
  if (!workflowRun || typeof workflowRun !== 'object') {
    return undefined
  }
  const id = (workflowRun as { id?: unknown }).id
  return typeof id === 'number' && Number.isSafeInteger(id) ? id : undefined
}
