import { useActiveWorktree, useRepoById } from '@/store/selectors'

import { LocalWorkspacePortsPanel } from './local-workspace-ports-panel'
import { SshPortsPanel } from './ssh-ports-panel'

export {
  killWorkspacePortForTarget,
  openWorkspacePortInBrowser,
  scanWorkspacePortsForTarget
} from '@/lib/workspace-port-actions'
export { getLocalWorkspacePortSections } from './local-workspace-port-sections'

export default function PortsPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)

  return activeRepo?.connectionId ? (
    <SshPortsPanel />
  ) : (
    <LocalWorkspacePortsPanel isVisible={isVisible} />
  )
}
