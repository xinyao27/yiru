import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'

import { useRightSidebarActivityItems } from '../right-sidebar/use-right-sidebar-activity-items'

export function TabBarWorkspacePanelMenuItems({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const { items } = useRightSidebarActivityItems(worktreeId)

  if (items.length === 0) {
    return null
  }

  const openPanel = (tab: ActiveRightSidebarTab): void => {
    const state = useAppStore.getState()
    if (tab === 'explorer') {
      state.showRightSidebarFiles()
      return
    }
    // Why: panel navigation now originates outside the sidebar, so selecting
    // an entry must reveal the destination as well as update its route.
    state.setRightSidebarTab(tab)
    state.setRightSidebarOpen(true)
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>
        {translate(
          'auto.components.tab.bar.TabBarWorkspacePanelMenuItems.workspacePanels',
          'Workspace panels'
        )}
      </DropdownMenuLabel>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <DropdownMenuItem key={item.id} onClick={() => openPanel(item.id)}>
            <Icon className="text-muted-foreground size-4" />
            <span className="flex-1">{item.title}</span>
            {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
