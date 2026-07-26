import type { CoworkingAccessAuthority } from './access-authority'
import type { CoworkingIngress } from './ingress'
import type { CoworkingOwnerCatalog } from './owner-catalog'
import type { CoworkingShareCatalog } from './share-catalog'
import type { CoworkingWindowsFirewallOperations } from './windows-firewall-recovery'
import type { CoworkingWorktreeVisibility } from './worktree-visibility'

export type CoworkingOwnerWorktreeDescriptor = {
  displayName: string
  projectId: string | null
  projectDisplayName: string
}

export type CoworkingOwnerServiceOptions = {
  visibility: CoworkingWorktreeVisibility
  access: CoworkingAccessAuthority
  shareCatalog: CoworkingShareCatalog
  ownerCatalog: CoworkingOwnerCatalog
  ingress: CoworkingIngress
  prepareIngress?: () => Promise<void>
  windowsFirewall?: CoworkingWindowsFirewallOperations
  onAvailabilityRecovered?: () => Promise<void>
  describeOwnerWorktree: (worktreeId: string) => CoworkingOwnerWorktreeDescriptor | null
}
