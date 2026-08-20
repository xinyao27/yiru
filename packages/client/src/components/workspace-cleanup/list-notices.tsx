import type React from 'react'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'

export function WorkspaceCleanupListNotices({
  activeBaseRowCount,
  activeFilters,
  activeRowCount,
  candidateCount,
  filteredCandidateCount,
  hasScan,
  initialLoading,
  loading,
  scanNoticeMessage,
  visibleCandidateCount,
  onClearFilters,
  onShowAllRepos,
  onShowIgnored
}: {
  activeBaseRowCount: number
  activeFilters: boolean
  activeRowCount: number
  candidateCount: number
  filteredCandidateCount: number
  hasScan: boolean
  initialLoading: boolean
  loading: boolean
  scanNoticeMessage: string | null
  visibleCandidateCount: number
  onClearFilters: () => void
  onShowAllRepos: () => void
  onShowIgnored: () => void
}): React.JSX.Element {
  const settled = !loading && hasScan
  return (
    <>
      {initialLoading ? <SkeletonRows /> : null}
      {settled && candidateCount === 0 && !scanNoticeMessage ? (
        <EmptyState
          title={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.d3eef9463d',
            'No inactive workspaces to delete.'
          )}
        />
      ) : null}
      {settled && candidateCount === 0 && scanNoticeMessage ? (
        <EmptyState
          title={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.97c772c4fe',
            'No inactive workspaces found in checked repositories.'
          )}
        />
      ) : null}
      {settled && candidateCount > 0 && filteredCandidateCount === 0 ? (
        <EmptyState
          title={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.a19040cd67',
            'No inactive workspaces match the selected repos.'
          )}
          actionLabel="Show all repos"
          onAction={onShowAllRepos}
        />
      ) : null}
      {settled && filteredCandidateCount > 0 && visibleCandidateCount === 0 ? (
        <EmptyState
          title={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4719327c9c',
            'All cleanup suggestions are ignored.'
          )}
          actionLabel="Review ignored workspaces"
          onAction={onShowIgnored}
        />
      ) : null}
      {settled && activeRowCount === 0 && activeBaseRowCount > 0 && activeFilters ? (
        <EmptyState
          title={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.3d957ff117',
            'No workspaces match these filters.'
          )}
          actionLabel={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.e94b1f8bb4',
            'Clear filters'
          )}
          onAction={onClearFilters}
        />
      ) : null}
      {settled && activeRowCount === 0 && visibleCandidateCount > 0 && !activeFilters ? (
        <EmptyState
          title={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.f68d538c63',
            'No workspaces in this cleanup set.'
          )}
        />
      ) : null}
    </>
  )
}

function SkeletonRows(): React.JSX.Element {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((index) => (
        <div key={index} className="border-border bg-muted/35 h-24 animate-pulse border" />
      ))}
    </div>
  )
}

function EmptyState({
  title,
  actionLabel,
  onAction
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
}): React.JSX.Element {
  return (
    <div className="border-border bg-muted/20 text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-3 border text-sm">
      <span>{title}</span>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
