import type { SpoolAccessAuthority } from './access-authority'
import type { SpoolDesktopCatalog } from './desktop-catalog'
import type { SpoolIngress } from './ingress'
import type { SpoolShareCatalog } from './share-catalog'
import type { SpoolWindowsFirewallOperations } from './windows-firewall-recovery'
import type { SpoolWorktreeVisibility } from './worktree-visibility'

export type SpoolOwnerWorktreeDescriptor = {
  displayName: string
  projectId: string | null
  projectDisplayName: string
}

export type SpoolDesktopServiceOptions = {
  visibility: SpoolWorktreeVisibility
  access: SpoolAccessAuthority
  shareCatalog: SpoolShareCatalog
  desktopCatalog: SpoolDesktopCatalog
  ingress: SpoolIngress
  prepareIngress?: () => Promise<void>
  windowsFirewall?: SpoolWindowsFirewallOperations
  onAvailabilityRecovered?: () => Promise<void>
  describeOwnerWorktree: (worktreeId: string) => SpoolOwnerWorktreeDescriptor | null
}
