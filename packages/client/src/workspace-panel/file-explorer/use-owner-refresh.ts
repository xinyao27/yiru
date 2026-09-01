import { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { splitPathSegments } from '../path-tree'
import type { FileExplorerModel } from './model'
import { getFileExplorerOwnerUnresolvedMessage } from './operation-owner'

export function useFileExplorerOwnerRefresh(model: FileExplorerModel): void {
  const { owner, tree } = model
  // Why: the first root load can land before the host catalog does. Retry only
  // the owner-resolution failure when the catalog gains new ownership evidence.
  const projectCatalog = useProjectCatalog()
  const ownerEvidence = projectCatalog.repos
  const ownerWorktreeEvidence = projectCatalogRepoBuckets(projectCatalog).worktreesByRepo
  const retryUnresolvedOwner = useEventCallback((): void => {
    if (
      !owner.visibleFilesWorktreePath ||
      tree.rootError !== getFileExplorerOwnerUnresolvedMessage()
    ) {
      return
    }
    tree.resetAndLoad()
  })
  useEffect(
    () => retryUnresolvedOwner(),
    [ownerEvidence, ownerWorktreeEvidence, retryUnresolvedOwner]
  )

  const loadExpandedDirectories = useEventCallback((): void => {
    if (!owner.visibleFilesWorktreePath) {
      return
    }
    for (const dirPath of tree.expanded) {
      if (!tree.dirCache[dirPath]?.children.length && !tree.dirCache[dirPath]?.loading) {
        const depth =
          splitPathSegments(dirPath.slice(owner.visibleFilesWorktreePath.length + 1)).length - 1
        void tree.loadDir(dirPath, depth)
      }
    }
  })
  useEffect(
    () => loadExpandedDirectories(),
    [loadExpandedDirectories, owner.visibleFilesWorktreePath, tree.expanded]
  )
}
