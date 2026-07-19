import type { SpoolAccessAuthority } from './spool-access-authority'
import type { SpoolDesktopCatalog } from './spool-desktop-catalog'
import type { SpoolIngress } from './spool-ingress'
import type { SpoolShareCatalog } from './spool-share-catalog'
import type { SpoolWindowsFirewallOperations } from './spool-windows-firewall-recovery'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

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
