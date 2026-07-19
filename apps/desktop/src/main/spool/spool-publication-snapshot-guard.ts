import type {
  SpoolOwnerWorktree,
  SpoolRegisteredWorktreeRoot,
  SpoolWorktreeRootComparison
} from './spool-worktree-incarnation'
import type {
  PreparedSpoolPublication,
  ReplacedSpoolPublication,
  SpoolOwnerWorktreeCatalogInventory,
  SpoolPublicationValidation,
  UnavailableSpoolPublication
} from './spool-worktree-publication-validation'

export function createEmptySpoolPublicationValidation(
  replaced: readonly ReplacedSpoolPublication[],
  unavailable: readonly UnavailableSpoolPublication[]
): SpoolPublicationValidation {
  return {
    ready: [],
    registeredInventory: { worktrees: [], unavailableSources: [] },
    registeredRoots: [],
    replaced,
    unavailable,
    overlappingInstanceIds: []
  }
}

export function hasStableSpoolPublicationSnapshot(
  expectedReady: readonly PreparedSpoolPublication[],
  scanned: SpoolPublicationValidation,
  guarded: SpoolPublicationValidation
): boolean {
  return (
    haveSameKeys(expectedReady, guarded.ready, preparedPublicationKey) &&
    haveSameKeys(scanned.registeredRoots, guarded.registeredRoots, registeredRootKey) &&
    haveSameRegisteredInventory(scanned.registeredInventory, guarded.registeredInventory)
  )
}

export function sameSpoolOwnerWorktreeSnapshotTarget(
  left: SpoolOwnerWorktree,
  right: SpoolOwnerWorktree
): boolean {
  return ownerWorktreeKey(left) === ownerWorktreeKey(right)
}

export function captureSpoolRegisteredInventory(
  inventory: SpoolOwnerWorktreeCatalogInventory
): SpoolOwnerWorktreeCatalogInventory {
  return {
    worktrees: inventory.worktrees.map((target) => ({ ...target })),
    unavailableSources: inventory.unavailableSources.map((source) => ({ ...source }))
  }
}

function haveSameRegisteredInventory(
  left: SpoolOwnerWorktreeCatalogInventory,
  right: SpoolOwnerWorktreeCatalogInventory
): boolean {
  return (
    haveSameKeys(left.worktrees, right.worktrees, ownerWorktreeKey) &&
    haveSameKeys(left.unavailableSources, right.unavailableSources, (source) =>
      JSON.stringify([source.repoId, source.executionHostId, source.actualHostScope])
    )
  )
}

function preparedPublicationKey(entry: PreparedSpoolPublication): string {
  return JSON.stringify([ownerWorktreeKey(entry.target), entry.markerId, rootKey(entry.root)])
}

function registeredRootKey(entry: SpoolRegisteredWorktreeRoot): string {
  return JSON.stringify([ownerWorktreeKey(entry.target), rootKey(entry.root)])
}

function ownerWorktreeKey(target: SpoolOwnerWorktree): string {
  return JSON.stringify([
    target.kind,
    target.worktreeId,
    target.instanceId,
    target.projectId,
    target.repoId,
    target.executionHostId,
    optionalString(target.connectionId),
    optionalString(target.projectHostSetupId),
    target.worktreePath
  ])
}

function rootKey(root: SpoolWorktreeRootComparison): string {
  return JSON.stringify([root.scopeKey, root.rootKey, root.ancestorKeys])
}

function optionalString(
  value: string | null | undefined
): readonly ['missing'] | readonly ['null'] | readonly ['value', string] {
  return value === undefined ? ['missing'] : value === null ? ['null'] : ['value', value]
}

function haveSameKeys<T>(
  left: readonly T[],
  right: readonly T[],
  keyOf: (value: T) => string
): boolean {
  if (left.length !== right.length) {
    return false
  }
  const leftKeys = left.map(keyOf).sort()
  const rightKeys = right.map(keyOf).sort()
  return leftKeys.every((key, index) => key === rightKeys[index])
}
