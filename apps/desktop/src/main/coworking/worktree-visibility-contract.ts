import type { CoworkingGrantJournal } from './grant-journal'
import type {
  CoworkingPreparedPublicationPersistence,
  CoworkingVisibilityStore
} from './visibility-persistence-transitions'
import type {
  CoworkingRegisteredWorktreeRoot,
  CoworkingWorktreeIncarnation
} from './worktree-incarnation'
import type { CoworkingOwnerWorktreeCatalog } from './worktree-publication-validation'
import type { PreparedCoworkingPublication } from './worktree-publication-validation'

export type CoworkingWorktreeVisibilityOptions = {
  store: CoworkingVisibilityStore
  denyJournal: Pick<
    CoworkingGrantJournal,
    'addVisibilityDenies' | 'removeVisibilityDenies' | 'snapshotVisibilityDenies'
  >
  catalog: CoworkingOwnerWorktreeCatalog
  incarnation: CoworkingWorktreeIncarnation
  createShareEpoch?: () => string
  createWorktreeInstanceId?: () => string
  prepareFirstPublication?: (
    entries: readonly PreparedCoworkingPublication[],
    registeredRoots: readonly CoworkingRegisteredWorktreeRoot[],
    refreshInstanceIds: ReadonlySet<string>
  ) => Promise<CoworkingPreparedPublicationPersistence>
  onListenerError?: (error: unknown) => void
}

export type CoworkingVisibilityReconciliationSignal =
  | { kind: 'deleted'; instanceId: string }
  | { kind: 'host-unavailable'; instanceId: string }
  | { kind: 'host-reconnected' | 'registered-roots-changed' }
