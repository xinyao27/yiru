import type { AppState } from '~renderer/store/types'

import type { ProjectCatalog } from './query'
import { projectCatalogRepoBuckets } from './repo-buckets'

export type ProjectCatalogStoreProjection = Pick<
  AppState,
  | 'detectedWorktreesByRepo'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'projectHostSetups'
  | 'projects'
  | 'repos'
  | 'workspaceLineageByChildKey'
  | 'worktreeLineageById'
  | 'worktreesByRepo'
>

const PROJECTION_BY_CATALOG = new WeakMap<ProjectCatalog, ProjectCatalogStoreProjection>()

export function projectCatalogStoreProjection(
  catalog: ProjectCatalog
): ProjectCatalogStoreProjection {
  const cached = PROJECTION_BY_CATALOG.get(catalog)
  if (cached) {
    return cached
  }
  const { detectedWorktreesByRepo, worktreesByRepo } = projectCatalogRepoBuckets(catalog)

  const projection = {
    detectedWorktreesByRepo,
    folderWorkspaces: [...catalog.folderWorkspaces],
    projectGroups: [...catalog.projectGroups],
    projectHostSetups: [...catalog.projectHostSetups],
    projects: [...catalog.projects],
    repos: [...catalog.repos],
    workspaceLineageByChildKey: { ...catalog.workspaceLineageByChildKey },
    worktreeLineageById: { ...catalog.worktreeLineageById },
    worktreesByRepo
  }
  PROJECTION_BY_CATALOG.set(catalog, projection)
  return projection
}
