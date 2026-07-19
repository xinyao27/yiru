import { CloudFog as Cloudy } from '@phosphor-icons/react'
import type React from 'react'

import { translate } from '@/i18n/i18n'

import { ProjectHeaderActions } from './project-header-actions'
import { SidebarDisclosure } from './sidebar-disclosure'
import { SidebarProjectHeader } from './sidebar-project-header'
import { WORKTREE_SECTION_HEADER_PADDING_LEFT } from './worktree-list-indentation'

export function SpoolRemoteWorktreesHeader({
  expanded,
  onToggle
}: {
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const label = translate('auto.components.sidebar.SpoolRemoteWorktreesHeader.title', 'Remote')
  return (
    <div className="pt-1" data-spool-remote-worktrees-header="">
      <SidebarProjectHeader
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        paddingLeft={WORKTREE_SECTION_HEADER_PADDING_LEFT}
        icon={<Cloudy aria-hidden="true" className="size-3.5" />}
        iconClassName="text-muted-foreground"
        label={label}
        className="focus-visible:ring-sidebar-ring cursor-pointer focus-visible:ring-1"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return
          }
          event.preventDefault()
          onToggle()
        }}
      >
        <ProjectHeaderActions>
          <SidebarDisclosure
            expanded={expanded}
            dataAttribute="repo-header-collapse"
            itemLabel={label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggle()
            }}
          />
        </ProjectHeaderActions>
      </SidebarProjectHeader>
    </div>
  )
}
