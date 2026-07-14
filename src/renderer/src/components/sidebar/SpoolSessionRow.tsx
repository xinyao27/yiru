import type React from 'react'
import { SquareTerminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolSessionSidebarRow } from './spool-sidebar-rows'

type SpoolSessionRowProps = {
  row: SpoolSessionSidebarRow
  onSelect: () => void
}

function getProviderLabel(provider: SpoolSessionSidebarRow['provider']): string {
  switch (provider) {
    case 'claude':
      return 'Claude'
    case 'codex':
      return 'Codex'
    case 'other':
      return translate('auto.components.sidebar.SpoolSessionRow.otherProvider', 'Other')
  }
}

export function SpoolSessionRow({ row, onSelect }: SpoolSessionRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      data-current={row.active ? 'true' : undefined}
      aria-current={row.active ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md py-1 pl-10 pr-1.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring',
        row.active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground hover:bg-worktree-sidebar-accent'
      )}
    >
      <SquareTerminal aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <TruncatedSidebarLabel text={row.title} className="min-w-0 flex-1 text-[12px] leading-4" />
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {getProviderLabel(row.provider)}
      </span>
    </button>
  )
}
