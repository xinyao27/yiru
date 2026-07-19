import { Buffer } from 'node:buffer'

import type { CheckStatus } from '../../shared/types'
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
  deriveBitbucketBuildStatus,
  mapBitbucketPullRequest,
  type BitbucketPullRequestInfo,
  type RawBitbucketBuildStatus,
  type RawBitbucketPullRequest
} from './pull-request-mappers'
import { getBitbucketRepoRef, type BitbucketRepoRef } from './repository-ref'

const DEFAULT_API_BASE_URL = 'https://api.bitbucket.org/2.0'
const REQUEST_TIMEOUT_MS = 5000
const ALL_PULL_REQUEST_STATES = ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'] as const

type BitbucketAuthConfig = {
  baseUrl: string
  accessToken: string | null
  email: string | null
  apiToken: string | null
}

export type BitbucketAuthStatus = {
  configured: boolean
  authenticated: boolean
  account: string | null
}

type RequestOptions = {
  searchParams?: Record<string, string | readonly string[]>
  timeoutMs?: number
  throwOnError?: boolean
  allowNotFound?: boolean
  signal?: AbortSignal
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function getAuthConfig(): BitbucketAuthConfig {
  return {
    baseUrl: envValue('YIRU_BITBUCKET_API_BASE_URL') ?? DEFAULT_API_BASE_URL,
    accessToken: envValue('YIRU_BITBUCKET_ACCESS_TOKEN'),
    email: envValue('YIRU_BITBUCKET_EMAIL'),
    apiToken: envValue('YIRU_BITBUCKET_API_TOKEN')
  }
}

function hasAuth(config: BitbucketAuthConfig): boolean {
  return Boolean(config.accessToken || (config.email && config.apiToken))
}

function authHeaders(config: BitbucketAuthConfig): Record<string, string> {
  if (config.accessToken) {
    return { Authorization: `Bearer ${config.accessToken}` }
  }
  if (config.email && config.apiToken) {
    const encoded = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  return {}
}

function isStringArray(value: string | readonly string[]): value is readonly string[] {
  return Array.isArray(value)
}

function apiUrl(path: string, searchParams?: RequestOptions['searchParams']): string {
  const config = getAuthConfig()
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = new URL(`${base}${path}`)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (isStringArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, item)
        }
      } else {
        url.searchParams.set(key, value)
      }
    }
  }
  return url.toString()
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
  const config = getAuthConfig()
  try {
    return await requestHostedReviewJson<T>(
      new URL(apiUrl(path, options.searchParams)),
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

function encodedRepoPath(repo: BitbucketRepoRef): string {
  return `${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}`
}

function escapeBitbucketQueryString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function allStateFilter(): string {
  return `(${ALL_PULL_REQUEST_STATES.map((state) => `state = "${state}"`).join(' OR ')})`
}

async function getBuildStatus(
  repo: BitbucketRepoRef,
  headSha: string | undefined,
  signal?: AbortSignal,
  throwOnError = false
): Promise<CheckStatus> {
  if (!headSha) {
    return 'neutral'
  }
  const data = await requestJson<{ values?: RawBitbucketBuildStatus[] }>(
    `/repositories/${encodedRepoPath(repo)}/commit/${encodeURIComponent(headSha)}/statuses/build`,
    { searchParams: { pagelen: '100' }, signal, throwOnError }
  )
  return deriveBitbucketBuildStatus(data?.values ?? [])
}

async function normalizePullRequest(
  repo: BitbucketRepoRef,
  raw: RawBitbucketPullRequest,
  signal?: AbortSignal,
  throwOnError = false
): Promise<BitbucketPullRequestInfo | null> {
  const headSha = raw.source?.commit?.hash?.trim()
  const status = await getBuildStatus(repo, headSha, signal, throwOnError)
  return mapBitbucketPullRequest(raw, status)
}

export async function getBitbucketAuthStatus(): Promise<BitbucketAuthStatus> {
  const config = getAuthConfig()
  if (!hasAuth(config)) {
    return { configured: false, authenticated: false, account: null }
  }
  const user = await requestJson<{
    username?: string | null
    display_name?: string | null
    account_id?: string | null
  }>('/user', { timeoutMs: 4000 })
  return {
    configured: true,
    authenticated: user !== null,
    account: user?.username ?? user?.display_name ?? user?.account_id ?? null
  }
}

export async function getBitbucketPullRequest(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<BitbucketPullRequestInfo | null> {
  const repo = await getBitbucketRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return null
  }
  const raw = await requestJson<RawBitbucketPullRequest>(
    `/repositories/${encodedRepoPath(repo)}/pullrequests/${encodeURIComponent(String(prNumber))}`,
    { signal: options.signal }
  )
  return raw ? normalizePullRequest(repo, raw, options.signal) : null
}

export async function getBitbucketPullRequestForBranch(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null,
  connectionId?: string | null,
  options: HostedReviewLookupOptions = {}
): Promise<BitbucketPullRequestInfo | null> {
  const branchName = branch.replace(/^refs\/heads\//, '')
  if (!branchName && linkedPRNumber == null) {
    return null
  }

  const repo = await getBitbucketRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  options.signal?.throwIfAborted()
  if (!repo) {
    if (options.throwOnProviderError) {
      throw new Error('Bitbucket repository lookup became unavailable.')
    }
    return null
  }

  if (branchName) {
    const query = [
      `source.branch.name = "${escapeBitbucketQueryString(branchName)}"`,
      allStateFilter()
    ].join(' AND ')
    const list = await requestJson<{ values?: RawBitbucketPullRequest[] }>(
      `/repositories/${encodedRepoPath(repo)}/pullrequests`,
      {
        throwOnError: options.throwOnProviderError,
        signal: options.signal,
        searchParams: {
          pagelen: '1',
          sort: '-updated_on',
          q: query,
          state: ALL_PULL_REQUEST_STATES
        }
      }
    )
    const raw = list?.values?.[0]
    if (raw) {
      return normalizePullRequest(repo, raw, options.signal, options.throwOnProviderError)
    }
  }

  if (typeof linkedPRNumber !== 'number') {
    return null
  }
  const raw = await requestJson<RawBitbucketPullRequest>(
    `/repositories/${encodedRepoPath(repo)}/pullrequests/${encodeURIComponent(String(linkedPRNumber))}`,
    // Why: only the durable exact-id lookup can interpret 404 as a deleted review.
    {
      allowNotFound: true,
      throwOnError: options.throwOnProviderError,
      signal: options.signal
    }
  )
  return raw ? normalizePullRequest(repo, raw, options.signal, options.throwOnProviderError) : null
}

export async function getBitbucketRepoSlug(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<BitbucketRepoRef | null> {
  return getBitbucketRepoRef(repoPath, connectionId, getHostedReviewLocalGitOptions(options))
}
