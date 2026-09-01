import type React from 'react'

import type { ImportedWorktreeCardActionState } from '../imported-worktrees-card-actions'
import ImportedWorktreesVisibilityLine from '../imported-worktrees-visibility-line'
import type { NewExternalWorktreesInboxActionState } from '../new-external-worktrees-inbox-actions'
import { toNewExternalWorktreeInboxPreview } from '../new-external-worktrees-inbox-candidates'
import NewExternalWorktreesInboxLine from '../new-external-worktrees-inbox-line'
import { PendingWorktreeRow } from '../pending-worktree-row'
import type {
  ImportedWorktreesCardRow,
  NewExternalWorktreesInboxRow,
  PendingCreationRow
} from './groups'
import { canKeepImportedWorktreesHidden } from './row-model'

type SpecialRowModel = ImportedWorktreesCardRow | NewExternalWorktreesInboxRow | PendingCreationRow

export function SpecialRow(props: {
  row: SpecialRowModel
  virtualKey: React.Key
  index: number
  importedActionState: ReadonlyMap<string, ImportedWorktreeCardActionState>
  inboxActionState: ReadonlyMap<string, NewExternalWorktreesInboxActionState>
  onShowImported: (repoId: string) => void
  onKeepImportedHidden: (repoId: string) => void
  onImportInboxWorktree: (repoId: string, worktreeId: string) => void
  onKeepInboxHidden: (repoId: string) => void
  onImportAllInbox: (repoId: string) => void
  onSuppressInbox: (repoId: string) => void
}): React.JSX.Element {
  const row = props.row
  const virtualRowProps = {
    'data-worktree-virtual-row': true,
    'data-worktree-virtual-row-key': String(props.virtualKey),
    'data-index': props.index
  }
  if (row.type === 'pending-creation') {
    return (
      <div role="presentation" {...virtualRowProps} className="relative px-2 pb-1.5">
        <PendingWorktreeRow creationId={row.creationId} />
      </div>
    )
  }
  if (row.type === 'imported-worktrees-card') {
    const actionState = props.importedActionState.get(row.repo.id)
    return (
      <div role="presentation" {...virtualRowProps} className="relative">
        <ImportedWorktreesVisibilityLine
          repoDisplayName={row.repo.displayName}
          hiddenWorktrees={row.hiddenWorktrees}
          placement={row.placement}
          pending={actionState?.pending ?? false}
          error={actionState?.error ?? null}
          onShow={() => props.onShowImported(row.repo.id)}
          onKeepHidden={
            canKeepImportedWorktreesHidden(row, actionState)
              ? () => props.onKeepImportedHidden(row.repo.id)
              : undefined
          }
        />
      </div>
    )
  }
  const actionState = props.inboxActionState.get(row.repo.id)
  return (
    <div role="presentation" {...virtualRowProps} className="relative">
      <NewExternalWorktreesInboxLine
        repoDisplayName={row.repo.displayName}
        inboxWorktrees={row.inboxWorktrees.map(toNewExternalWorktreeInboxPreview)}
        pending={actionState?.pending ?? false}
        error={actionState?.error ?? null}
        onImportWorktree={(worktreeId) => props.onImportInboxWorktree(row.repo.id, worktreeId)}
        onKeepHidden={() => props.onKeepInboxHidden(row.repo.id)}
        onImportAll={() => props.onImportAllInbox(row.repo.id)}
        onSuppress={() => props.onSuppressInbox(row.repo.id)}
      />
    </div>
  )
}
