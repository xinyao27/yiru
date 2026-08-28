import {
  getProxyBypassRulesFromEnvironment,
  getProxyUrlFromEnvironment,
  normalizeProxyBypassRules,
  normalizeProxyUrl,
  type NetworkProxySettings
} from '@yiru/runtime-protocol/workbench/network-proxy'

type BunProxyFetchInit = RequestInit & { proxy: string }
type ProxyConfiguration = { bypassRules: string; url: string }

let proxySettingsProvider: (() => NetworkProxySettings) | null = null

export function fetchHttp(input: string | Request, init?: RequestInit): Promise<Response> {
  const target = requestUrl(input)
  const proxy = resolveProxyConfiguration()
  if (!proxy || !target || shouldBypassProxy(target, proxy.bypassRules)) {
    return globalThis.fetch(input, init)
  }
  const bunInit: BunProxyFetchInit = { ...init, proxy: proxy.url }
  return globalThis.fetch(input, bunInit)
}

export function setHttpFetchProxySettingsProvider(
  provider: (() => NetworkProxySettings) | null
): void {
  proxySettingsProvider = provider
}

function resolveProxyConfiguration(): ProxyConfiguration | null {
  const settings = proxySettingsProvider?.()
  const configuredProxy = normalizeProxyUrl(settings?.httpProxyUrl)
  const environmentProxy = getProxyUrlFromEnvironment(process.env)
  const proxy = configuredProxy.ok && configuredProxy.value ? configuredProxy : environmentProxy
  if (!proxy.ok || !proxy.value) {
    return null
  }
  return {
    bypassRules:
      normalizeProxyBypassRules(settings?.httpProxyBypassRules) ||
      getProxyBypassRulesFromEnvironment(process.env),
    url: proxy.value
  }
}

function requestUrl(input: string | Request): URL | null {
  try {
    const url = new URL(typeof input === 'string' ? input : input.url)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function shouldBypassProxy(target: URL, bypassRules: string): boolean {
  const hostname = target.hostname.toLowerCase()
  const port = target.port || (target.protocol === 'https:' ? '443' : '80')
  return bypassRules.split(';').some((value) => bypassRuleMatches(value, hostname, port))
}

function bypassRuleMatches(value: string, hostname: string, port: string): boolean {
  const rule = value.trim().toLowerCase()
  if (!rule) {
    return false
  }
  if (rule === '*') {
    return true
  }
  const target = parseBypassTarget(rule)
  if (!target || (target.port && target.port !== port)) {
    return false
  }
  const suffix = target.hostname.replace(/^\*?\./, '')
  return hostname === suffix || hostname.endsWith(`.${suffix}`)
}

function parseBypassTarget(rule: string): { hostname: string; port: string } | null {
  try {
    const url = new URL(rule.includes('://') ? rule : `http://${rule}`)
    return url.hostname ? { hostname: url.hostname, port: url.port } : null
  } catch {
    return null
  }
}
