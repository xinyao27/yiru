import type { MobileConnectionPath } from './stable-logical-rpc-client'
import type { HostProfile } from './types'

export function directPathForEndpoint(
  host: HostProfile,
  endpoint: string
): Exclude<MobileConnectionPath, 'relay'> {
  try {
    const hostname = new URL(endpoint).hostname
    if (hostname.endsWith('.ts.net') || /^100\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname)) {
      return 'tailscale'
    }
  } catch {}
  return 'lan'
}
