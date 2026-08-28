import type { ExtensionRuntimeBootstrap } from './session'

export const EXTENSION_QUERY_CACHE_KEY = 'yiru.query-cache.v2'

export function extensionQueryCacheBuster(bootstrap: ExtensionRuntimeBootstrap): string {
  const endpoint = new URL(bootstrap.endpoint)
  const host = endpoint.hostname.toLowerCase()
  const target = ['127.0.0.1', 'localhost', '[::1]'].includes(host)
    ? 'local-daemon'
    : `${endpoint.protocol}//${endpoint.host}${endpoint.pathname}`
  // Why: the daemon runtime id and loopback port change on every restart, while
  // the last workspace snapshot must survive that restart to make cold open useful.
  return `v2:${bootstrap.protocolVersion}:${target}`
}
