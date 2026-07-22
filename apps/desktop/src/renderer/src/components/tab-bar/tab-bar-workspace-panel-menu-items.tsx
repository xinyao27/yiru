import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from '@/components/ui/dropdown-menu'
import { openWorkspacePanelTab } from '@/lib/open-workspace-panel-tab'

import { useRightSidebarActivityItems } from '../right-sidebar/use-right-sidebar-activity-items'

export function TabBarWorkspacePanelMenuItems({
  worktreeId,
  groupId
}: {
  worktreeId: string
  groupId: string
}): React.JSX.Element | null {
  const { items } = useRightSidebarActivityItems(worktreeId)

  if (items.length === 0) {
    return null
  }

  return (
    <>
      <DropdownMenuSeparator />
      {items.map((item) => {
        const Icon = item.icon
        return (
          <DropdownMenuItem
            key={item.id}
            onClick={() => openWorkspacePanelTab({ panel: item.id, worktreeId, groupId })}
          >
            <Icon className="text-muted-foreground size-4" />
            <span className="flex-1">{item.title}</span>
            {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
