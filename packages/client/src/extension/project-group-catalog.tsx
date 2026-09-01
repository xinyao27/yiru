import { useEffect, useMemo } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'

import { getExtensionBrowserCapabilities } from './browser-capabilities'

export function ProjectGroupCatalogBridge(): null {
  const catalog = useProjectCatalog()
  const projects = useMemo(
    () =>
      catalog.repos.map((project) => ({
        displayName: project.displayName,
        projectId: project.id
      })),
    [catalog.repos]
  )

  useEffect(() => {
    if (!catalog.isPending) {
      void getExtensionBrowserCapabilities().publishProjectCatalog(projects)
    }
  }, [catalog.isPending, projects])
  return null
}
