import type { SpoolVisibilityDenyJournal } from './spool-visibility-deny-journal'
import type {
  SpoolPreparedPublicationPersistence,
  SpoolVisibilityStore
} from './spool-visibility-persistence-transitions'
import type {
  SpoolRegisteredWorktreeRoot,
  SpoolWorktreeIncarnation
} from './spool-worktree-incarnation'
import type { SpoolOwnerWorktreeCatalog } from './spool-worktree-publication-validation'
import type { PreparedSpoolPublication } from './spool-worktree-publication-validation'

export type SpoolWorktreeVisibilityOptions = {
  store: SpoolVisibilityStore
  denyJournal: Pick<SpoolVisibilityDenyJournal, 'add' | 'remove' | 'snapshot'>
  catalog: SpoolOwnerWorktreeCatalog
  incarnation: SpoolWorktreeIncarnation
  createShareEpoch?: () => string
  createWorktreeInstanceId?: () => string
  prepareFirstPublication?: (
    entries: readonly PreparedSpoolPublication[],
    registeredRoots: readonly SpoolRegisteredWorktreeRoot[],
    refreshInstanceIds: ReadonlySet<string>
  ) => Promise<SpoolPreparedPublicationPersistence>
  onListenerError?: (error: unknown) => void
}

export type SpoolVisibilityReconciliationSignal =
  | { kind: 'deleted'; instanceId: string }
  | { kind: 'host-unavailable'; instanceId: string }
  | { kind: 'host-reconnected' | 'registered-roots-changed' }
