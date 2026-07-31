import type React from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

import type { GitHistoryItem } from '../../../../../shared/git/history'
import type { GitGraphColumnWidths } from './column-widths'
import { formatGitGraphShortDate } from './format'
import { GitGraphRefBadge } from './ref-badge'

export type GitGraphCommitRowProps = {
  item: GitHistoryItem
  graphColumnWidth: number
  columnWidths: GitGraphColumnWidths
  isCurrent: boolean
  isDetailsOpen: boolean
  isFindMatch: boolean
  isFindCurrent: boolean
  onClick: () => void
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>
}

export const GitGraphCommitRow = function GitGraphCommitRow({
  item,
  graphColumnWidth,
  columnWidths,
  isCurrent,
  isDetailsOpen,
  isFindMatch,
  isFindCurrent,
  onClick,
  onContextMenu
}: GitGraphCommitRowProps): React.JSX.Element {
  const rowTooltip = item.message || item.subject

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      onContextMenu={onContextMenu}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-center text-left text-xs transition-colors outline-none',
        isDetailsOpen ? 'bg-accent/60 hover:bg-accent/80' : 'hover:bg-accent/40',
        isFindMatch && !isFindCurrent && 'bg-primary/10',
        isFindCurrent && 'bg-primary/20'
      )}
      style={{ height: 24 }}
      title={rowTooltip}
    >
      <span className="h-full shrink-0" style={{ width: graphColumnWidth }} aria-hidden="true" />
      <span
        className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden pr-2"
        style={{ width: columnWidths.description }}
      >
        {(item.references ?? []).map((ref) => (
          <GitGraphRefBadge key={ref.id} itemRef={ref} />
        ))}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  'text-foreground block min-w-0 flex-1 truncate',
                  isCurrent && 'font-bold'
                )}
              >
                {item.subject}
              </span>
            }
          />
          <TooltipContent side="bottom" sideOffset={6} className="max-w-96 whitespace-pre-wrap">
            {rowTooltip}
          </TooltipContent>
        </Tooltip>
      </span>
      <span
        className="text-muted-foreground shrink-0 truncate pr-2"
        style={{ width: columnWidths.date }}
      >
        {formatGitGraphShortDate(item.timestamp)}
      </span>
      <span
        className="text-muted-foreground shrink-0 truncate pr-2"
        style={{ width: columnWidths.author }}
      >
        {item.author ?? ''}
      </span>
      <span
        className="text-muted-foreground shrink-0 truncate pr-2 font-mono"
        style={{ width: columnWidths.commit }}
      >
        {item.displayId ?? item.id.slice(0, 8)}
      </span>
    </div>
  )
}
