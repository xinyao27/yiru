import {
  HostedReviewApiRequestError,
  requestHostedReviewJson
} from '../source-control/hosted-review-api-request'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import type { HostedReviewLookupOptions } from '../source-control/hosted-review-lookup-options'
import {
  deriveGiteaCommitStatus,
  mapGiteaPullRequest,
  type GiteaPullRequestInfo,
  type RawGiteaCombinedStatus,
  type RawGiteaPullRequest
} from './pull-request-mappers'
import { invalidateGiteaPullRequestScan, scanGiteaPullRequests } from './pull-request-scan-cache'
import { getGiteaRepoRef, type GiteaRepoRef } from './repository-ref'

const REQUEST_TIMEOUT_MS = 5000
// Why: self-hosted Forgejo can take ~5s to serve one /pulls page (it loads
// reviewer data per PR). The default 5s cap aborted responses right as they
// completed, so the work was discarded and retried on the next refresh (#8807).
const PULL_REQUEST_LIST_TIMEOUT_MS = 15_000
const PULL_REQUEST_PAGE_LIMIT = 50
const MAX_PULL_REQUEST_PAGES = 5

type GiteaAuthConfig = {
  apiBaseUrl: string | null
  token: string | null
}

export type GiteaAuthStatus = {
  configured: boolean
  authenticated: boolean
  account: string | null
  baseUrl: string | null
  tokenConfigured: boolean
}

type RequestOptions = {
  searchParams?: Record<string, string | number>
  timeoutMs?: number
  throwOnError?: boolean
  allowNotFound?: boolean
  signal?: AbortSignal
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

export function normalizeGiteaApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return /\/api\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

function getAuthConfig(): GiteaAuthConfig {
  const apiBaseUrl = envValue('YIRU_GITEA_API_BASE_URL')
  return {
    apiBaseUrl: apiBaseUrl ? normalizeGiteaApiBaseUrl(apiBaseUrl) : null,
    token: envValue('YIRU_GITEA_TOKEN')
  }
}

function authHeaders(config: Pick<GiteaAuthConfig, 'token'>): Record<string, string> {
  return config.token ? { Authorization: `token ${config.token}` } : {}
}

function configuredApiBaseUrl(repo: GiteaRepoRef): string {
  return getAuthConfig().apiBaseUrl ?? repo.apiBaseUrl
}

function apiUrl(baseUrl: string, path: string, searchParams?: RequestOptions['searchParams']): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

async function requestJsonAtBase<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  const config = getAuthConfig()
  try {
    return await requestHostedReviewJson<T>(
      apiUrl(baseUrl, path, options.searchParams),
      {
        headers: {
          Accept: 'application/json',
          ...authHeaders(config)
        }
      },
      options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      options.signal
    )
  } catch (error) {
    options.signal?.throwIfAborted()
    if (
      options.allowNotFound &&
      error instanceof HostedReviewApiRequestError &&
      error.status === 404
    ) {
      return null
    }
    if (options.throwOnError) {
      throw error
    }
    return null
  }
}

function requestJson<T>(
  repo: GiteaRepoRef,
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  return requestJsonAtBase(configuredApiBaseUrl(repo), path, options)
}

function encodedRepoPath(repo: GiteaRepoRef): string {
  return `${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
}

function giteaPullRequestScanKey(repo: GiteaRepoRef): string {
  return `${configuredApiBaseUrl(repo)}/${encodedRepoPath(repo)}`
}

/** Invalidate the shared /pulls scan after Yiru itself creates a PR so the
 *  next worktree-card refresh sees it instead of a cached miss. */
export function invalidateGiteaPullRequestScanForRepo(repo: GiteaRepoRef): void {
  invalidateGiteaPullRequestScan(giteaPullRequestScanKey(repo))
}

async function getCommitStatus(
  repo: GiteaRepoRef,
  headSha: string | undefined,
  signal?: AbortSignal,
  throwOnError = false
): Promise<ReturnType<typeof deriveGiteaCommitStatus>> {
  if (!headSha) {
    return 'neutral'
  }
  const data = await requestJson<RawGiteaCombinedStatus>(
    repo,
    `/repos/${encodedRepoPath(repo)}/commits/${encodeURIComponent(headSha)}/status`,
    { signal, throwOnError }
  )
  return deriveGiteaCommitStatus(data)
}

async function normalizePullRequest(
  repo: GiteaRepoRef,
  raw: RawGiteaPullRequest,
  signal?: AbortSignal,
  throwOnError = false
): Promise<GiteaPullRequestInfo | null> {
  const status = await getCommitStatus(repo, raw.head?.sha?.trim(), signal, throwOnError)
  return mapGiteaPullRequest(raw, status)
}

function matchesBranch(raw: RawGiteaPullRequest, branchName: string): boolean {
  const ref = raw.head?.ref?.trim()
  if (ref === branchName) {
    return true
  }
  const label = raw.head?.label?.trim()
  return label === branchName || label?.endsWith(`:${branchName}`) === true
}

export async function getGiteaAuthStatus(): Promise<GiteaAuthStatus> {
  const config = getAuthConfig()
  const tokenConfigured = config.token !== null
  if (!config.apiBaseUrl && !tokenConfigured) {
    return {
      configured: false,
      authenticated: false,
      account: null,
      baseUrl: null,
      tokenConfigured: false
    }
  }
  if (!config.apiBaseUrl) {
    return {
      configured: true,
      authenticated: true,
      account: null,
      baseUrl: null,
      tokenConfigured
    }
  }

  if (!tokenConfigured) {
    const version = await requestJsonAtBase<{ version?: string }>(config.apiBaseUrl, '/version', {
      timeoutMs: 4000
    })
    return {
      configured: version !== null,
      authenticated: false,
      account: null,
      baseUrl: config.apiBaseUrl,
      tokenConfigured
    }
  }

  const user = await requestJsonAtBase<{
    login?: string | null
    username?: string | null
    full_name?: string | null
  }>(config.apiBaseUrl, '/user', { timeoutMs: 4000 })
  return {
    configured: true,
    authenticated: user !== null,
    account: user?.login ?? user?.username ?? user?.full_name ?? null,
    baseUrl: config.apiBaseUrl,
    tokenConfigured
  }
}

export async function getGiteaPullRequest(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<GiteaPullRequestInfo | null> {
  const repo = await getGiteaRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return null
  }
  const raw = await requestJson<RawGiteaPullRequest>(
    repo,
    `/repos/${encodedRepoPath(repo)}/pulls/${encodeURIComponent(String(prNumber))}`,
    { signal: options.signal }
  )
  return raw ? normalizePullRequest(repo, raw, options.signal) : null
}

export async function getGiteaPullRequestForBranch(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null,
  connectionId?: string | null,
  options: HostedReviewLookupOptions = {}
): Promise<GiteaPullRequestInfo | null> {
  const branchName = branch.replace(/^refs\/heads\//, '')
  if (!branchName && linkedPRNumber == null) {
    return null
  }

  const repo = await getGiteaRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  options.signal?.throwIfAborted()
  if (!repo) {
    if (options.throwOnProviderError) {
      throw new Error('Gitea repository lookup became unavailable.')
    }
    return null
  }

  if (branchName) {
    // Why: cancellable remote lookups cannot share an in-flight request whose
    // AbortSignal belongs to another caller; ordinary sidebar scans still use
    // the bounded repo cache to protect self-hosted Gitea instances.
    const pullRequests = await scanGiteaPullRequests(
      giteaPullRequestScanKey(repo),
      (page) =>
        requestJson<RawGiteaPullRequest[]>(repo, `/repos/${encodedRepoPath(repo)}/pulls`, {
          throwOnError: options.throwOnProviderError,
          signal: options.signal,
          searchParams: {
            state: 'all',
            sort: 'recentupdate',
            page,
            limit: PULL_REQUEST_PAGE_LIMIT
          },
          timeoutMs: PULL_REQUEST_LIST_TIMEOUT_MS
        }),
      PULL_REQUEST_PAGE_LIMIT,
      MAX_PULL_REQUEST_PAGES,
      !options.signal && !options.throwOnProviderError
    )
    const raw = pullRequests.find((item) => matchesBranch(item, branchName))
    if (raw) {
      return normalizePullRequest(repo, raw, options.signal, options.throwOnProviderError)
    }
  }

  if (typeof linkedPRNumber !== 'number') {
    return null
  }
  const raw = await requestJson<RawGiteaPullRequest>(
    repo,
    `/repos/${encodedRepoPath(repo)}/pulls/${encodeURIComponent(String(linkedPRNumber))}`,
    // Why: only the durable exact-id lookup can interpret 404 as a deleted review.
    {
      allowNotFound: true,
      throwOnError: options.throwOnProviderError,
      signal: options.signal
    }
  )
  return raw ? normalizePullRequest(repo, raw, options.signal, options.throwOnProviderError) : null
}

export async function getGiteaRepoSlug(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<GiteaRepoRef | null> {
  return getGiteaRepoRef(repoPath, connectionId, getHostedReviewLocalGitOptions(options))
}
