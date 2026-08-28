import { useRef } from 'react'

import type { ProjectCatalog } from './query'

type ReferencedValue<Value> = {
  references: readonly unknown[]
  value: Value
}

const PROJECT_CATALOG_KEYS = [
  'allWorktrees',
  'detectedWorktreesByRepo',
  'folderWorkspaces',
  'isPending',
  'projectHostSetups',
  'projects',
  'projectGroups',
  'repos',
  'revisionByTarget',
  'runtimeEnvironments',
  'workspaceLineageByChildKey',
  'worktreeLineageById',
  'worktreeRevisionByTargetRepo',
  'worktreesByRepo'
] as const satisfies readonly (keyof ProjectCatalog)[]

function referencesMatch(left: readonly unknown[], right: readonly unknown[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  )
}

export function useReferencedCatalogValue<Value>(
  references: readonly unknown[],
  create: () => Value
): Value {
  const cacheRef = useRef<ReferencedValue<Value> | null>(null)
  if (cacheRef.current && referencesMatch(cacheRef.current.references, references)) {
    return cacheRef.current.value
  }
  const value = create()
  cacheRef.current = { references: [...references], value }
  return value
}

export function useStructurallySharedCatalog(candidate: ProjectCatalog): ProjectCatalog {
  const previousRef = useRef<ProjectCatalog | null>(null)
  const previous = previousRef.current
  if (previous && PROJECT_CATALOG_KEYS.every((key) => Object.is(previous[key], candidate[key]))) {
    return previous
  }
  previousRef.current = candidate
  return candidate
}
