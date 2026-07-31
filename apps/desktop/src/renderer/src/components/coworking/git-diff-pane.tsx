import { GitDiff as GitCompareArrows, CaretLeft as ChevronLeft } from '@phosphor-icons/react'
import type React from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

import type {
  CoworkingGitDiffResult,
  CoworkingGitHistoryEntry,
  CoworkingGitStatusEntry
} from '../../../../shared/coworking/operation-contract'

export function CoworkingGitDiffPane({
  diff,
  historyEntry,
  loading,
  onBack,
  statusEntry,
  unavailable
}: {
  diff: CoworkingGitDiffResult | null
  historyEntry: CoworkingGitHistoryEntry | null
  loading: boolean
  onBack: () => void
  statusEntry: CoworkingGitStatusEntry | null
  unavailable: boolean
}): React.JSX.Element {
  const title = historyEntry?.subject || statusEntry?.relativePath || null
  if (!title) {
    return (
      <GitDiffMessage
        message={translate(
          'auto.components.coworking.CoworkingGitDiffPane.selectItem',
          'Select a change or commit to inspect its diff.'
        )}
      />
    )
  }
  return (
    <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="border-border bg-sidebar text-sidebar-foreground flex min-h-9 shrink-0 items-center gap-2 border-b px-3 py-1">
        <Button type="button" size="xs" variant="ghost" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          {translate('auto.components.coworking.CoworkingGitDiffPane.back', 'Back')}
        </Button>
        <GitCompareArrows aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-foreground min-w-0 flex-1 truncate font-mono text-xs">{title}</span>
      </header>
      {loading ? (
        <GitDiffMessage
          message={translate(
            'auto.components.coworking.CoworkingGitDiffPane.loading',
            'Loading diff…'
          )}
        />
      ) : unavailable ? (
        <GitDiffMessage
          message={translate(
            'auto.components.coworking.CoworkingGitDiffPane.unavailable',
            'This diff is unavailable.'
          )}
        />
      ) : !diff?.patch ? (
        <GitDiffMessage
          message={translate(
            'auto.components.coworking.CoworkingGitDiffPane.noDiff',
            'No textual diff is available.'
          )}
        />
      ) : (
        <div className="scrollbar-editor min-h-0 flex-1 overflow-auto">
          {diff.truncated ? (
            <p className="border-border bg-muted/50 text-muted-foreground border-b px-3 py-2 text-xs">
              {translate(
                'auto.components.coworking.CoworkingGitDiffPane.truncated',
                'This diff is truncated.'
              )}
            </p>
          ) : null}
          <pre className="text-foreground min-w-max p-3 font-mono text-xs leading-5 whitespace-pre">
            {diff.patch}
          </pre>
        </div>
      )}
    </section>
  )
}

function GitDiffMessage({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="bg-background text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-xs">
      {message}
    </div>
  )
}
