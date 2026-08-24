import type { PRCheckDetail } from '~shared/types'

import { parseActionsRunId } from './check-detail-fetch'
import {
  getPendingApprovalCheckSuiteName,
  getPendingApprovalCheckSuiteUrl,
  nullableString,
  nullableNumber
} from './check-details'
import type { OwnerRepo } from './github-cli'
import {
  mapCheckRunRESTStatus,
  mapCheckRunRESTConclusion,
  mapCommitStatusRESTStatus,
  mapCommitStatusRESTConclusion
} from './mappers'

export const PR_CHECKS_ROLLUP_QUERY = `
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      headRefOid
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    databaseId
                    name
                    status
                    conclusion
                    detailsUrl
                    url
                    checkSuite {
                      databaseId
                      workflowRun {
                        databaseId
                      }
                    }
                  }
                  ... on StatusContext {
                    context
                    state
                    targetUrl
                  }
                }
              }
            }
            checkSuites(first: 100) {
              nodes {
                databaseId
                status
                conclusion
                url
                app {
                  name
                  slug
                }
              }
            }
          }
        }
      }
    }
  }
}
`

export type GraphQLPRChecksResponse = {
  data?: {
    repository?: {
      pullRequest?: {
        headRefOid?: string | null
        commits?: {
          nodes?: { commit?: GraphQLPRChecksCommit | null }[] | null
        } | null
      } | null
    } | null
  } | null
}

export type GraphQLPRChecksCommit = {
  statusCheckRollup?: {
    contexts?: {
      nodes?: GraphQLStatusCheckContext[] | null
    } | null
  } | null
  checkSuites?: {
    nodes?: GraphQLCheckSuite[] | null
  } | null
}

export type GraphQLCheckRunContext = {
  __typename: 'CheckRun'
  databaseId?: number | null
  name?: string | null
  status?: string | null
  conclusion?: string | null
  detailsUrl?: string | null
  url?: string | null
  checkSuite?: {
    databaseId?: number | null
    workflowRun?: { databaseId?: number | null } | null
  } | null
}

export type GraphQLStatusContext = {
  __typename: 'StatusContext'
  context?: string | null
  state?: string | null
  targetUrl?: string | null
}

export type GraphQLStatusCheckContext =
  | GraphQLCheckRunContext
  | GraphQLStatusContext
  | { __typename?: string | null }

export type GraphQLCheckSuite = {
  databaseId?: number | null
  status?: string | null
  conclusion?: string | null
  url?: string | null
  app?: { name?: string | null; slug?: string | null } | null
}

export type RestCheckRun = {
  id?: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  details_url: string | null
}

export type RestCommitStatus = {
  context?: string
  state?: string
  target_url?: string | null
}

export type RestCheckSuite = {
  id?: number | null
  status: string | null
  conclusion: string | null
  app?: { name?: string | null; slug?: string | null } | null
}

export function isGraphQLCheckRunContext(
  context: GraphQLStatusCheckContext
): context is GraphQLCheckRunContext {
  return context.__typename === 'CheckRun'
}

export function isGraphQLStatusContext(
  context: GraphQLStatusCheckContext
): context is GraphQLStatusContext {
  return context.__typename === 'StatusContext'
}

export function mapGraphQLCheckRunContext(context: GraphQLCheckRunContext): PRCheckDetail | null {
  const name = nullableString(context.name)
  if (!name) {
    return null
  }
  const url = nullableString(context.detailsUrl) ?? nullableString(context.url)
  const checkRunId = nullableNumber(context.databaseId)
  const workflowRunId =
    nullableNumber(context.checkSuite?.workflowRun?.databaseId) ?? parseActionsRunId(url)
  return {
    name,
    status: mapCheckRunRESTStatus(context.status ?? ''),
    conclusion: mapCheckRunRESTConclusion(context.status ?? '', context.conclusion ?? null),
    url,
    ...(checkRunId !== null ? { checkRunId } : {}),
    ...(typeof workflowRunId === 'number' ? { workflowRunId } : {})
  }
}

export function mapGraphQLStatusContext(context: GraphQLStatusContext): PRCheckDetail | null {
  const name = nullableString(context.context)
  if (!name) {
    return null
  }
  const url = nullableString(context.targetUrl)
  const workflowRunId = parseActionsRunId(url)
  return {
    name,
    status: mapCommitStatusRESTStatus(context.state ?? ''),
    conclusion: mapCommitStatusRESTConclusion(context.state ?? ''),
    url,
    ...(workflowRunId !== undefined ? { workflowRunId } : {})
  }
}

export function mapRestCheckRun(checkRun: RestCheckRun): PRCheckDetail {
  return {
    name: checkRun.name,
    status: mapCheckRunRESTStatus(checkRun.status),
    conclusion: mapCheckRunRESTConclusion(checkRun.status, checkRun.conclusion),
    url: checkRun.details_url || checkRun.html_url || null,
    ...(typeof checkRun.id === 'number' ? { checkRunId: checkRun.id } : {}),
    workflowRunId: parseActionsRunId(checkRun.details_url || checkRun.html_url || null)
  }
}

export function mapRestCommitStatus(status: RestCommitStatus): PRCheckDetail | null {
  const name = nullableString(status.context)
  if (!name) {
    return null
  }
  const url = nullableString(status.target_url)
  const workflowRunId = parseActionsRunId(url)
  return {
    name,
    status: mapCommitStatusRESTStatus(status.state ?? ''),
    conclusion: mapCommitStatusRESTConclusion(status.state ?? ''),
    url,
    ...(workflowRunId !== undefined ? { workflowRunId } : {})
  }
}

export function mapGraphQLPendingApprovalCheckSuite(
  ownerRepo: OwnerRepo,
  suite: GraphQLCheckSuite,
  headSha: string | null | undefined,
  index: number
): PRCheckDetail {
  return {
    name: getPendingApprovalCheckSuiteName(suite, headSha, index),
    status: 'completed',
    conclusion: 'action_required',
    // Why: suite-only approval blockers have no check run; use the suite page
    // as the actionable destination when GraphQL exposes one.
    url:
      nullableString(suite.url) ??
      (headSha ? getPendingApprovalCheckSuiteUrl(ownerRepo, headSha, suite.databaseId) : null)
  }
}

export function mapGraphQLPRChecksResponse(
  ownerRepo: OwnerRepo,
  response: GraphQLPRChecksResponse
): PRCheckDetail[] | null {
  const pullRequest = response.data?.repository?.pullRequest
  if (!pullRequest) {
    return null
  }
  const commit = pullRequest.commits?.nodes?.[0]?.commit
  if (!commit) {
    return []
  }

  const contexts = commit.statusCheckRollup?.contexts?.nodes ?? []
  const checkRunContexts = contexts.filter(isGraphQLCheckRunContext)
  const checkRuns = checkRunContexts
    .map(mapGraphQLCheckRunContext)
    .filter((check): check is PRCheckDetail => check !== null)
  const checkRunNames = new Set(checkRuns.map((check) => check.name))
  const checkSuiteIdsWithRuns = new Set(
    checkRunContexts
      .map((context) => nullableNumber(context.checkSuite?.databaseId))
      .filter((id): id is number => id !== null)
  )
  // Why: mixed-CI repos expose Jenkins/Prow/Tide as legacy status contexts
  // inside the same rollup as check runs. Keep check-run metadata on collisions.
  const legacyStatuses = contexts
    .filter(isGraphQLStatusContext)
    .map(mapGraphQLStatusContext)
    .filter((check): check is PRCheckDetail => check !== null && !checkRunNames.has(check.name))
  const pendingApprovalChecks = (commit.checkSuites?.nodes ?? [])
    .filter((suite) => suite.conclusion?.toLowerCase() === 'action_required')
    .filter((suite) => {
      const suiteId = nullableNumber(suite.databaseId)
      return suiteId === null || !checkSuiteIdsWithRuns.has(suiteId)
    })
    .map((suite, index) =>
      mapGraphQLPendingApprovalCheckSuite(ownerRepo, suite, pullRequest.headRefOid, index)
    )

  return [...checkRuns, ...legacyStatuses, ...pendingApprovalChecks]
}
