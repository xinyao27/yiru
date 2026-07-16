import type React from 'react'
import { Cloud } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { SidebarProjectHeader } from './SidebarProjectHeader'
import { WORKTREE_SECTION_HEADER_PADDING_LEFT } from './worktree-list-indentation'

export function SpoolRemoteWorktreesHeader(): React.JSX.Element {
  return (
    <div className="pt-1" data-spool-remote-worktrees-header="">
      <SidebarProjectHeader
        role="heading"
        aria-level={2}
        paddingLeft={WORKTREE_SECTION_HEADER_PADDING_LEFT}
        icon={<Cloud aria-hidden="true" className="size-3.5" />}
        iconClassName="text-muted-foreground"
        label={translate('auto.components.sidebar.SpoolRemoteWorktreesHeader.title', 'Remote')}
        className="cursor-default"
      />
    </div>
  )
}
