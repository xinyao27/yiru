import type { SidebarHostOption } from '../host-options'

export function canSelectAddRepoHost(host: Pick<SidebarHostOption, 'health' | 'kind'>): boolean {
  // Why: the SSH transport is gone, so an SSH-kind host can never be opened,
  // cloned into, or created on from this dialog even if it reports 'available'.
  return host.kind !== 'ssh' && (host.health === 'local' || host.health === 'available')
}
