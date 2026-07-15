import type React from 'react'
import { Folder } from 'lucide-react'
import type { SpoolProjectSidebarRow } from './spool-sidebar-rows'
import { getProjectGroupHeaderPaddingLeft } from './worktree-list-indentation'
import { ProjectHeaderActions } from './ProjectHeaderActions'
import { SidebarDisclosure } from './SidebarDisclosure'
import { SidebarProjectHeader } from './SidebarProjectHeader'

type SpoolProjectRowProps = {
  row: SpoolProjectSidebarRow
  onToggle: () => void
}

export function SpoolProjectRow({ row, onToggle }: SpoolProjectRowProps): React.JSX.Element {
  const hasWorktrees = row.worktreeCount > 0
  // Why: A shared Project is one compact tree step beneath its Desktop.
  return (
    <SidebarProjectHeader
      role="button"
      tabIndex={hasWorktrees ? 0 : -1}
      aria-expanded={hasWorktrees ? row.expanded : undefined}
      aria-disabled={!hasWorktrees}
      onClick={hasWorktrees ? onToggle : undefined}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          !hasWorktrees ||
          (event.key !== 'Enter' && event.key !== ' ')
        ) {
          return
        }
        event.preventDefault()
        onToggle()
      }}
      className={hasWorktrees ? 'cursor-pointer' : 'cursor-default'}
      paddingLeft={getProjectGroupHeaderPaddingLeft(1)}
      icon={<Folder aria-hidden="true" className="size-3" />}
      iconClassName="text-muted-foreground"
      label={row.name}
    >
      {hasWorktrees ? (
        <ProjectHeaderActions>
          <SidebarDisclosure
            expanded={row.expanded}
            itemLabel={row.name}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggle()
            }}
          />
        </ProjectHeaderActions>
      ) : null}
    </SidebarProjectHeader>
  )
}
