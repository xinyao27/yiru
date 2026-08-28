import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '~renderer/store/state'

import { registerProjectCatalogSnapshot } from './catalog-snapshot'
import { useProjectCatalogEvents } from './events'
import { useProjectCatalogQuery, type ProjectCatalog } from './query'
import {
  projectCatalogStoreProjection,
  type ProjectCatalogStoreProjection
} from './store-projection'

const ProjectCatalogContext = createContext<ProjectCatalog | null>(null)

export function ProjectCatalogProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  useProjectCatalogEvents()
  const queryClient = useQueryClient()
  const catalog = useProjectCatalogQuery()
  useCommittedProjectCatalogSnapshot(catalog, queryClient)
  useLegacyProjectCatalogStoreBridge(catalog)
  return <ProjectCatalogContext value={catalog}>{children}</ProjectCatalogContext>
}

function useCommittedProjectCatalogSnapshot(
  catalog: ProjectCatalog,
  queryClient: QueryClient
): void {
  useLayoutEffect(
    () => registerProjectCatalogSnapshot(catalog, queryClient),
    [catalog, queryClient]
  )
}

export function useProjectCatalog(): ProjectCatalog {
  const catalog = useContext(ProjectCatalogContext)
  if (!catalog) {
    throw new Error('project_catalog_provider_missing')
  }
  return catalog
}

function useLegacyProjectCatalogStoreBridge(catalog: ProjectCatalog): void {
  const projection = projectCatalogStoreProjection(catalog)
  const projectionRef = useRef<ProjectCatalogStoreProjection>(projection)
  const lastAppliedProjectionRef = useRef<ProjectCatalogStoreProjection | null>(null)
  projectionRef.current = projection

  useLayoutEffect(() => {
    if (catalog.isPending || lastAppliedProjectionRef.current === projection) {
      return
    }
    lastAppliedProjectionRef.current = projection
    useAppStore.setState((state) => ({
      ...projectionRef.current,
      sortEpoch: state.sortEpoch + 1
    }))
  }, [catalog.isPending, projection])
}
