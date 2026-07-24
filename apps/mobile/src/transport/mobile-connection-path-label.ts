import type { MobileConnectionPath } from './stable-logical-rpc-client'

export function mobileConnectionPathLabel(path: MobileConnectionPath): string {
  return path === 'tailscale' ? 'Direct · Tailscale' : 'Direct · LAN'
}
