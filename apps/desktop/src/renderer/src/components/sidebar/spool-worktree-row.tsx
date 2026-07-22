import { Cloud } from '@phosphor-icons/react'
import type React from 'react'

import { getSpoolSessionCatalogStatusLabel } from '@/components/spool/spool-session-catalog-status'
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card'

import { SidebarDisclosure } from './sidebar-disclosure'
import { SpoolDesktopUsageHoverCard } from './spool-desktop-usage-hover-card'
import type { SpoolWorktreeSidebarRow } from './spool-sidebar-rows'
import { getSpoolWorktreeDisplayTitle } from './spool-worktree-display-title'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import { WorktreeCardSurface } from './worktree-card-surface'
import {
  DIRECT_PROJECT_WORKTREE_CONTENT_INDENT,
  getFlushWorktreeCardPaddingLeft
} from './worktree-list-indentation'

type SpoolWorktreeRowProps = {
  row: SpoolWorktreeSidebarRow
  onToggle: () => void
  onSelect: () => void
}

export function SpoolWorktreeRow({
  row,
  onToggle,
  onSelect
}: SpoolWorktreeRowProps): React.JSX.Element {
  const hasSessions = row.sessionCount > 0
  const sessionCatalogLabel = getSpoolSessionCatalogStatusLabel(row.sessionCatalogStatus)
  const metadata = [row.branch, sessionCatalogLabel].filter(Boolean).join(' · ')
  // Why: flattened worktrees no longer inherit owner context from a Desktop row.
  const displayTitle = getSpoolWorktreeDisplayTitle(row.desktop.userDisplayName, row.name)
  const trigger = (
    <WorktreeCardSurface
      data-current={row.active ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-current={row.active ? 'page' : undefined}
      density={metadata ? 'details' : 'title-only'}
      flush
      activeVariant={row.active ? 'primary' : undefined}
      style={{
        paddingLeft: getFlushWorktreeCardPaddingLeft(DIRECT_PROJECT_WORKTREE_CONTENT_INDENT)
      }}
      trailing={
        hasSessions ? (
          <SidebarDisclosure
            expanded={row.expanded}
            itemLabel={displayTitle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggle()
            }}
          />
        ) : undefined
      }
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
          return
        }
        event.preventDefault()
        onSelect()
      }}
    >
      <div className="flex w-full min-w-0 items-start gap-0.5 pl-0">
        <div
          className="flex w-4 shrink-0 items-start justify-center pt-[2px]"
          data-spool-worktree-status-slot=""
        >
          {/* Why: remote location is the primary distinction after these rows flatten into Projects. */}
          <Cloud aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
        </div>
        <div
          className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden"
          data-spool-worktree-content=""
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center">
              <TruncatedSidebarLabel
                text={displayTitle}
                className="min-w-0 flex-1 text-[13px] leading-5 font-normal"
              />
            </div>
          </div>
          {metadata ? (
            <TruncatedSidebarLabel
              text={metadata}
              className="text-muted-foreground text-[11px] leading-none"
            />
          ) : null}
        </div>
      </div>
    </WorktreeCardSurface>
  )

  return (
    <HoverCard>
      <HoverCardTrigger delay={200} closeDelay={100} render={trigger} />
      <SpoolDesktopUsageHoverCard desktop={row.desktop} />
    </HoverCard>
  )
}
