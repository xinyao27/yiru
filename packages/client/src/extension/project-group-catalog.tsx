import { useEffect, useRef } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'

import { getExtensionBrowserCapabilities } from './browser-capabilities'

export function ProjectGroupCatalogBridge(): null {
  const catalog = useProjectCatalog()
  const projects = catalog.repos.map((project) => ({
    displayName: project.displayName,
    projectId: project.id
  }))
  const fingerprint = JSON.stringify(projects)
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  useEffect(() => {
    if (!catalog.isPending) {
      void getExtensionBrowserCapabilities().publishProjectCatalog(projectsRef.current)
    }
  }, [catalog.isPending, fingerprint])
  return null
}
