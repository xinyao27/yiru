import type { SidebarHostOption } from '../host-options'

export function canSelectAddRepoHost(host: Pick<SidebarHostOption, 'health' | 'kind'>): boolean {
  return host.health === 'local' || host.health === 'available'
}
