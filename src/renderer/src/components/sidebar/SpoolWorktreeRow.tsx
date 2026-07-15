import type React from 'react'
import { Folder, GitBranch } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import type { SpoolWorktreeSidebarRow } from './spool-sidebar-rows'
import {
  getFlushWorktreeCardPaddingLeft,
  getProjectGroupHeaderPaddingLeft
} from './worktree-list-indentation'
import { SidebarDisclosure } from './SidebarDisclosure'
import { WorktreeCardSurface } from './WorktreeCardSurface'

type SpoolWorktreeRowProps = {
  row: SpoolWorktreeSidebarRow
  onToggle: () => void
  onSelect: () => void
}

function getSessionCatalogLabel(
  status: SpoolWorktreeSidebarRow['sessionCatalogStatus']
): string | null {
  switch (status) {
    case 'loading':
      return translate(
        'auto.components.sidebar.SpoolWorktreeRow.loadingSessions',
        'Loading sessions…'
      )
    case 'error':
      return translate(
        'auto.components.sidebar.SpoolWorktreeRow.sessionsUnavailable',
        'Session list unavailable'
      )
    case 'complete':
      return null
  }
}

export function SpoolWorktreeRow({
  row,
  onToggle,
  onSelect
}: SpoolWorktreeRowProps): React.JSX.Element {
  const hasSessions = row.sessionCount > 0
  const sessionCatalogLabel = getSessionCatalogLabel(row.sessionCatalogStatus)
  const metadata = [row.branch, sessionCatalogLabel].filter(Boolean).join(' · ')
  // Why: Worktrees advance one more compact step beneath their Project.
  return (
    <WorktreeCardSurface
      data-current={row.active ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-current={row.active ? 'page' : undefined}
      density={metadata ? 'details' : 'title-only'}
      flush
      activeVariant={row.active ? 'primary' : undefined}
      className="focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
      style={{
        paddingLeft: getFlushWorktreeCardPaddingLeft(getProjectGroupHeaderPaddingLeft(2))
      }}
      trailing={
        hasSessions ? (
          <SidebarDisclosure
            expanded={row.expanded}
            itemLabel={row.name}
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
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {row.kind === 'folder' ? (
                <Folder aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <TruncatedSidebarLabel
                text={row.name}
                className="min-w-0 flex-1 text-[13px] font-normal leading-5"
              />
            </div>
          </div>
          {metadata ? (
            <TruncatedSidebarLabel
              text={metadata}
              className="text-[11px] leading-none text-muted-foreground"
            />
          ) : null}
        </div>
      </div>
    </WorktreeCardSurface>
  )
}
