import type { SpoolSessionCatalogPage } from '../../shared/spool/spool-catalog-contract'
import type { SpoolCatalogReferenceTable } from './spool-catalog-reference-table'
import type { SpoolCatalogReferenceBinding } from './spool-catalog-reference-table'
import {
  projectCatalogSessionPage,
  type ResolvedSpoolCatalogWorktree
} from './spool-catalog-projection-model'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

export type SpoolCatalogSessionPageRequest = {
  worktreeRef: string
  shareEpoch: string
  catalogRevision: number
  cursor: string
}

export function readSpoolCatalogSessionPage(options: {
  request: SpoolCatalogSessionPageRequest
  generation: number
  catalogRevision: number
  snapshotGeneration: number
  snapshotDescriptions: readonly ResolvedSpoolCatalogWorktree[]
  references: SpoolCatalogReferenceTable
  visibility: SpoolWorktreeVisibility
}): { page: SpoolSessionCatalogPage; generation: number } | null {
  const pageBinding = options.references.resolve(options.request.cursor)
  const worktreeBinding = options.references.resolve(options.request.worktreeRef)
  if (
    options.snapshotGeneration !== options.generation ||
    options.request.catalogRevision !== options.catalogRevision ||
    !pageBinding ||
    pageBinding.kind !== 'session-page' ||
    pageBinding.catalogRevision !== options.request.catalogRevision ||
    pageBinding.generation !== options.generation ||
    pageBinding.shareEpoch !== options.request.shareEpoch ||
    !worktreeBinding ||
    worktreeBinding.kind !== 'worktree' ||
    !sameWorktreeBinding(pageBinding, worktreeBinding) ||
    !options.visibility.isPublic(pageBinding.instanceId, pageBinding.shareEpoch)
  ) {
    return null
  }
  const description = options.snapshotDescriptions.find(
    (entry) =>
      entry.instance.instanceId === pageBinding.instanceId &&
      entry.instance.shareEpoch === pageBinding.shareEpoch &&
      entry.instance.worktreeId === pageBinding.worktreeId
  )
  if (!description) {
    return null
  }
  return {
    page: projectCatalogSessionPage(
      options.request.worktreeRef,
      pageBinding,
      description,
      options.catalogRevision,
      options.references
    ),
    generation: options.generation
  }
}

function sameWorktreeBinding(
  page: Extract<SpoolCatalogReferenceBinding, { kind: 'session-page' }>,
  worktree: Extract<SpoolCatalogReferenceBinding, { kind: 'worktree' }>
): boolean {
  return (
    page.worktreeId === worktree.worktreeId &&
    page.instanceId === worktree.instanceId &&
    page.shareEpoch === worktree.shareEpoch
  )
}
