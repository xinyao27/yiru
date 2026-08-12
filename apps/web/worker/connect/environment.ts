export type WebWorkerEnvironment = {
  ASSETS: Fetcher
  CONNECT_GRANTS: DurableObjectNamespace
  CONNECT_MACHINES: DurableObjectNamespace
  CONNECT_BROWSER_RATE_LIMIT: RateLimit
  CONNECT_NETWORK_RATE_LIMIT: RateLimit
}
