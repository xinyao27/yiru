import { acquireCdp, releaseCdp, sendCdp, subscribeCdp } from '../cdp/session'
import {
  optionalString,
  readHeaders,
  readStringArray,
  readStringValue,
  requiredString
} from './command-value'

type FetchState = {
  credentials: { password: string; username: string } | null
  patterns: string[] | null
  requests: {
    headers: Record<string, string>
    id: string
    method: string
    resourceType: string
    url: string
  }[]
}

const fetchStates = new Map<number, FetchState>()

export function registerBrowserFetchListeners(): void {
  subscribeCdp((tabId, method, params) => {
    const state = fetchStates.get(tabId)
    if (!state) {
      return
    }
    if (method === 'Fetch.authRequired') {
      void continueAuthentication(tabId, params, state)
      return
    }
    if (method === 'Fetch.requestPaused') {
      void continueInterceptedRequest(tabId, params, state)
    }
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    fetchStates.delete(tabId)
    void releaseCdp(tabId, 'browser-intercept')
  })
}

export async function enableInterception(tabId: number, input: Record<string, unknown>) {
  const patterns = readStringArray(Reflect.get(input, 'patterns')) ?? ['*']
  const state = fetchStates.get(tabId) ?? { credentials: null, patterns: null, requests: [] }
  state.patterns = patterns
  fetchStates.set(tabId, state)
  await configureFetch(tabId, state)
  return { enabled: true, patterns }
}

export async function disableInterception(tabId: number) {
  const state = fetchStates.get(tabId)
  if (!state) {
    return { disabled: true }
  }
  state.patterns = null
  await configureFetch(tabId, state)
  return { disabled: true }
}

export function listInterceptedRequests(tabId: number) {
  return { requests: fetchStates.get(tabId)?.requests ?? [] }
}

export async function setCredentials(tabId: number, input: Record<string, unknown>) {
  const state = fetchStates.get(tabId) ?? { credentials: null, patterns: null, requests: [] }
  state.credentials = {
    password: requiredString(input, 'pass', true),
    username: requiredString(input, 'user')
  }
  fetchStates.set(tabId, state)
  await configureFetch(tabId, state)
  return { configured: true }
}

async function configureFetch(tabId: number, state: FetchState): Promise<void> {
  if (!state.patterns && !state.credentials) {
    fetchStates.delete(tabId)
    await sendCdp(tabId, 'Fetch.disable').catch(() => {})
    await releaseCdp(tabId, 'browser-intercept')
    return
  }
  await acquireCdp(tabId, 'browser-intercept')
  await sendCdp(tabId, 'Fetch.enable', {
    handleAuthRequests: state.credentials !== null,
    patterns: (state.patterns ?? ['*']).map((urlPattern) => ({ urlPattern }))
  })
}

async function continueAuthentication(
  tabId: number,
  params: Record<string, unknown>,
  state: FetchState
): Promise<void> {
  const requestId = Reflect.get(params, 'requestId')
  if (typeof requestId !== 'string') {
    return
  }
  await sendCdp(tabId, 'Fetch.continueWithAuth', {
    authChallengeResponse: state.credentials
      ? { response: 'ProvideCredentials', ...state.credentials }
      : { response: 'Default' },
    requestId
  }).catch(() => {})
}

async function continueInterceptedRequest(
  tabId: number,
  params: Record<string, unknown>,
  state: FetchState
): Promise<void> {
  const requestId = Reflect.get(params, 'requestId')
  const request = Reflect.get(params, 'request')
  if (typeof requestId !== 'string' || typeof request !== 'object' || request === null) {
    return
  }
  if (state.patterns) {
    state.requests.push({
      headers: readHeaders(Reflect.get(request, 'headers')),
      id: requestId,
      method: readStringValue(request, 'method'),
      resourceType: optionalString(params, 'resourceType') ?? '',
      url: readStringValue(request, 'url')
    })
    if (state.requests.length > 500) {
      state.requests.shift()
    }
  }
  await sendCdp(tabId, 'Fetch.continueRequest', { requestId }).catch(() => {})
}
