import type React from 'react'
import { ChevronLeft, GitCompareArrows } from 'lucide-react'
import type {
  SpoolGitDiffResult,
  SpoolGitHistoryEntry,
  SpoolGitStatusEntry
} from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SpoolGitDiffPane({
  diff,
  historyEntry,
  loading,
  onBack,
  surface = 'workspace',
  statusEntry,
  unavailable
}: {
  diff: SpoolGitDiffResult | null
  historyEntry: SpoolGitHistoryEntry | null
  loading: boolean
  onBack?: () => void
  surface?: 'workspace' | 'sidebar'
  statusEntry: SpoolGitStatusEntry | null
  unavailable: boolean
}): React.JSX.Element {
  const title = historyEntry?.subject || statusEntry?.relativePath || null
  if (!title) {
    return (
      <GitDiffMessage
        message={translate(
          'auto.components.spool.SpoolGitDiffPane.selectItem',
          'Select a change or commit to inspect its diff.'
        )}
      />
    )
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--editor-surface)]">
      <header
        className={cn(
          'flex min-h-9 shrink-0 items-center gap-2 border-b border-border px-3 py-1',
          surface === 'sidebar'
            ? 'bg-sidebar text-sidebar-foreground'
            : 'bg-card text-card-foreground'
        )}
      >
        {surface === 'sidebar' && onBack ? (
          <Button type="button" size="xs" variant="ghost" onClick={onBack}>
            <ChevronLeft aria-hidden="true" />
            {translate('auto.components.spool.SpoolGitDiffPane.back', 'Back')}
          </Button>
        ) : null}
        <GitCompareArrows aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{title}</span>
        {surface === 'workspace' && historyEntry ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {historyEntry.commitRef.slice(0, 12)}
          </span>
        ) : surface === 'workspace' && statusEntry ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatChangeArea(statusEntry)}
          </span>
        ) : null}
      </header>
      {loading ? (
        <GitDiffMessage
          message={translate('auto.components.spool.SpoolGitDiffPane.loading', 'Loading diff…')}
        />
      ) : unavailable ? (
        <GitDiffMessage
          message={translate(
            'auto.components.spool.SpoolGitDiffPane.unavailable',
            'This diff is unavailable.'
          )}
        />
      ) : !diff?.patch ? (
        <GitDiffMessage
          message={translate(
            'auto.components.spool.SpoolGitDiffPane.noDiff',
            'No textual diff is available.'
          )}
        />
      ) : (
        <div className="scrollbar-editor min-h-0 flex-1 overflow-auto">
          {diff.truncated ? (
            <p className="border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {translate(
                'auto.components.spool.SpoolGitDiffPane.truncated',
                'This diff is truncated.'
              )}
            </p>
          ) : null}
          <pre
            className={cn(
              'min-w-max whitespace-pre font-mono text-xs leading-5 text-foreground',
              surface === 'sidebar' ? 'p-3' : 'p-4'
            )}
          >
            {diff.patch}
          </pre>
        </div>
      )}
    </section>
  )
}

function GitDiffMessage({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--editor-surface)] p-6 text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function formatChangeArea(entry: SpoolGitStatusEntry): string {
  if (entry.area === 'staged') {
    return translate('auto.components.spool.SpoolGitDiffPane.staged', 'Staged')
  }
  if (entry.area === 'untracked') {
    return translate('auto.components.spool.SpoolGitDiffPane.untracked', 'Untracked')
  }
  return translate('auto.components.spool.SpoolGitDiffPane.unstaged', 'Unstaged')
}
