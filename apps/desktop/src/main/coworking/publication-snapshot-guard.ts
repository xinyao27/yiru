import type {
  CoworkingOwnerWorktree,
  CoworkingRegisteredWorktreeRoot,
  CoworkingWorktreeRootComparison
} from './worktree-incarnation'
import type {
  PreparedCoworkingPublication,
  ReplacedCoworkingPublication,
  CoworkingOwnerWorktreeCatalogInventory,
  CoworkingPublicationValidation,
  UnavailableCoworkingPublication
} from './worktree-publication-validation'

export function createEmptyCoworkingPublicationValidation(
  replaced: readonly ReplacedCoworkingPublication[],
  unavailable: readonly UnavailableCoworkingPublication[]
): CoworkingPublicationValidation {
  return {
    ready: [],
    registeredInventory: { worktrees: [], unavailableSources: [] },
    registeredRoots: [],
    replaced,
    unavailable,
    overlappingInstanceIds: []
  }
}

export function hasStableCoworkingPublicationSnapshot(
  expectedReady: readonly PreparedCoworkingPublication[],
  scanned: CoworkingPublicationValidation,
  guarded: CoworkingPublicationValidation
): boolean {
  return (
    haveSameKeys(expectedReady, guarded.ready, preparedPublicationKey) &&
    haveSameKeys(scanned.registeredRoots, guarded.registeredRoots, registeredRootKey) &&
    haveSameRegisteredInventory(scanned.registeredInventory, guarded.registeredInventory)
  )
}

export function sameCoworkingOwnerWorktreeSnapshotTarget(
  left: CoworkingOwnerWorktree,
  right: CoworkingOwnerWorktree
): boolean {
  return ownerWorktreeKey(left) === ownerWorktreeKey(right)
}

export function captureCoworkingRegisteredInventory(
  inventory: CoworkingOwnerWorktreeCatalogInventory
): CoworkingOwnerWorktreeCatalogInventory {
  return {
    worktrees: inventory.worktrees.map((target) => ({ ...target })),
    unavailableSources: inventory.unavailableSources.map((source) => ({ ...source }))
  }
}

function haveSameRegisteredInventory(
  left: CoworkingOwnerWorktreeCatalogInventory,
  right: CoworkingOwnerWorktreeCatalogInventory
): boolean {
  return (
    haveSameKeys(left.worktrees, right.worktrees, ownerWorktreeKey) &&
    haveSameKeys(left.unavailableSources, right.unavailableSources, (source) =>
      JSON.stringify([source.repoId, source.executionHostId, source.actualHostScope])
    )
  )
}

function preparedPublicationKey(entry: PreparedCoworkingPublication): string {
  return JSON.stringify([ownerWorktreeKey(entry.target), entry.markerId, rootKey(entry.root)])
}

function registeredRootKey(entry: CoworkingRegisteredWorktreeRoot): string {
  return JSON.stringify([ownerWorktreeKey(entry.target), rootKey(entry.root)])
}

function ownerWorktreeKey(target: CoworkingOwnerWorktree): string {
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

function rootKey(root: CoworkingWorktreeRootComparison): string {
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
