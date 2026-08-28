import { LocalWorkspacePortsPanel } from './local-workspace-ports-panel'

export {
  killWorkspacePortForTarget,
  openWorkspacePortInBrowser,
  scanWorkspacePortsForTarget
} from '~renderer/ports/actions'
export { getLocalWorkspacePortSections } from './local-workspace-port-sections'

export default function PortsPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  return <LocalWorkspacePortsPanel isVisible={isVisible} />
}
