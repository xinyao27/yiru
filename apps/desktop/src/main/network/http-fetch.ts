import { EnvHttpProxyAgent, type Dispatcher } from 'undici'
import {
  getProxyBypassRulesFromEnvironment,
  getProxyUrlFromEnvironment,
  normalizeProxyBypassRules,
  normalizeProxyUrl,
  type NetworkProxySettings
} from '~shared/network-proxy'

type HttpFetch = (input: string | Request, init?: RequestInit) => Promise<Response>

type NodeFetchInit = RequestInit & { dispatcher: Dispatcher }
type ProxyDispatcher = { key: string; value: EnvHttpProxyAgent }

let fetchProvider: HttpFetch | null = null
let proxySettingsProvider: (() => NetworkProxySettings) | null = null
let proxyDispatcher: ProxyDispatcher | null = null

export function fetchHttp(input: string | Request, init?: RequestInit): Promise<Response> {
  if (fetchProvider) {
    return fetchProvider(input, init)
  }
  const dispatcher = getNodeProxyDispatcher()
  if (!dispatcher) {
    return globalThis.fetch(input, init)
  }
  const nodeInit: NodeFetchInit = { ...init, dispatcher }
  return globalThis.fetch(input, nodeInit)
}

export function setHttpFetchProvider(provider: HttpFetch): void {
  fetchProvider = provider
}

export function setHttpFetchProxySettingsProvider(
  provider: (() => NetworkProxySettings) | null
): void {
  proxySettingsProvider = provider
  closeNodeProxyDispatcher()
}

export function closeNodeProxyDispatcher(): void {
  const current = proxyDispatcher
  proxyDispatcher = null
  if (current) {
    void current.value.close()
  }
}

function getNodeProxyDispatcher(): EnvHttpProxyAgent | null {
  const settings = proxySettingsProvider?.()
  const configuredProxy = normalizeProxyUrl(settings?.httpProxyUrl)
  const environmentProxy = getProxyUrlFromEnvironment(process.env)
  const proxyUrl = configuredProxy.ok && configuredProxy.value ? configuredProxy : environmentProxy
  if (!proxyUrl.ok || !proxyUrl.value) {
    return null
  }
  const configuredBypass = normalizeProxyBypassRules(settings?.httpProxyBypassRules)
  const bypassRules = configuredBypass || getProxyBypassRulesFromEnvironment(process.env)
  const key = `${proxyUrl.value}\n${bypassRules}`
  if (proxyDispatcher?.key === key) {
    return proxyDispatcher.value
  }
  closeNodeProxyDispatcher()
  const value = new EnvHttpProxyAgent({
    httpProxy: proxyUrl.value,
    httpsProxy: proxyUrl.value,
    noProxy: bypassRules.replaceAll(';', ',')
  })
  proxyDispatcher = { key, value }
  return value
}
