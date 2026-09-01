import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'

import { getExtensionBrowserCapabilities } from './browser-capabilities'
import { extensionOrpc } from './runtime/orpc'
import { workspacePortClaims } from './workspace-port-claims'

const WORKSPACE_PORT_REFRESH_INTERVAL_MS = 5_000

export function WorkspacePortClaimsBridge(): null {
  const catalog = useProjectCatalog()
  const projects = catalog.repos.map((project) => ({
    displayName: project.displayName,
    id: project.id
  }))
  const workspacePorts = useQuery({
    ...extensionOrpc.workspacePorts.scan.queryOptions({ input: {} }),
    refetchInterval: WORKSPACE_PORT_REFRESH_INTERVAL_MS
  })
  useEffect(() => {
    if (workspacePorts.data) {
      void getExtensionBrowserCapabilities().publishWorkspacePortClaims(
        workspacePortClaims(workspacePorts.data, projects)
      )
    }
  }, [projects, workspacePorts.data])
  return null
}
