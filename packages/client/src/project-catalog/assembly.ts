import type { ProjectCatalog } from './query'

export function useReferencedCatalogValue<Value>(
  _references: readonly unknown[],
  create: () => Value
): Value {
  return create()
}

export function useStructurallySharedCatalog(candidate: ProjectCatalog): ProjectCatalog {
  return candidate
}
