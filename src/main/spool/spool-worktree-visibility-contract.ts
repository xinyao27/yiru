import type { SpoolVisibilityDenyJournal } from './spool-visibility-deny-journal'
import type { SpoolVisibilityStore } from './spool-visibility-persistence-transitions'
import type { SpoolWorktreeIncarnation } from './spool-worktree-incarnation'
import type { SpoolOwnerWorktreeCatalog } from './spool-worktree-publication-validation'
import type { PreparedSpoolPublication } from './spool-worktree-publication-validation'

export type SpoolWorktreeVisibilityOptions = {
  store: SpoolVisibilityStore
  denyJournal: Pick<SpoolVisibilityDenyJournal, 'add' | 'remove' | 'snapshot'>
  catalog: SpoolOwnerWorktreeCatalog
  incarnation: SpoolWorktreeIncarnation
  createShareEpoch?: () => string
  createWorktreeInstanceId?: () => string
  attestFirstPublication?: (entries: readonly PreparedSpoolPublication[]) => Promise<void>
  onListenerError?: (error: unknown) => void
}

export type SpoolVisibilityReconciliationSignal =
  | { kind: 'deleted'; instanceId: string }
  | { kind: 'host-unavailable'; instanceId: string }
  | { kind: 'host-reconnected' | 'registered-roots-changed' }
