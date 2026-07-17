import { Buffer } from 'node:buffer'
import type { AzureDevOpsRepoRef } from './repository-ref'
import {
  HostedReviewApiRequestError,
  requestHostedReviewJson
} from '../source-control/hosted-review-api-request'

const REQUEST_TIMEOUT_MS = 5000

type AzureDevOpsAuthConfig = {
  apiBaseUrl: string | null
  pat: string | null
  accessToken: string | null
  username: string | null
}

export type AzureDevOpsRequestOptions = {
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

export function normalizeAzureDevOpsApiBaseUrl(value: string): string {
  return value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/_apis$/i, '')
}

export function getAzureDevOpsAuthConfig(): AzureDevOpsAuthConfig {
  return {
    apiBaseUrl: envValue('YIRU_AZURE_DEVOPS_API_BASE_URL'),
    pat: envValue('YIRU_AZURE_DEVOPS_TOKEN') ?? envValue('YIRU_AZURE_DEVOPS_PAT'),
    accessToken: envValue('YIRU_AZURE_DEVOPS_ACCESS_TOKEN'),
    username: envValue('YIRU_AZURE_DEVOPS_USERNAME')
  }
}

export function azureDevOpsTokenConfigured(config: AzureDevOpsAuthConfig): boolean {
  return Boolean(config.pat || config.accessToken)
}

function authHeaders(config: AzureDevOpsAuthConfig): Record<string, string> {
  if (config.accessToken) {
    return { Authorization: `Bearer ${config.accessToken}` }
  }
  if (config.pat) {
    const encoded = Buffer.from(`${config.username ?? ''}:${config.pat}`).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  return {}
}

function configuredApiBaseUrl(repo: AzureDevOpsRepoRef): string {
  const configured = getAzureDevOpsAuthConfig().apiBaseUrl
  return configured ? normalizeAzureDevOpsApiBaseUrl(configured) : repo.apiBaseUrl
}

function apiUrl(
  baseUrl: string,
  path: string,
  searchParams?: AzureDevOpsRequestOptions['searchParams']
): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  const params = { ...searchParams, 'api-version': searchParams?.['api-version'] ?? '7.1' }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return url
}

export async function requestAzureDevOpsJsonAtBase<T>(
  baseUrl: string,
  path: string,
  options: AzureDevOpsRequestOptions = {}
): Promise<T | null> {
  const config = getAzureDevOpsAuthConfig()
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

export function requestAzureDevOpsJson<T>(
  repo: AzureDevOpsRepoRef,
  path: string,
  options: AzureDevOpsRequestOptions = {}
): Promise<T | null> {
  return requestAzureDevOpsJsonAtBase(configuredApiBaseUrl(repo), path, options)
}
