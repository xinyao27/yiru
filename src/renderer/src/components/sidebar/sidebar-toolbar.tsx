import React from 'react'
import { ScrollToCurrentWorkspaceToolbarButton } from './scroll-to-current-workspace-toolbar-button'
import { SidebarSettingsHelpMenu } from './sidebar-settings-help-menu'
import { YiruProfileSwitcher } from '../yiru-profiles/yiru-profile-switcher'

const SidebarToolbar = React.memo(function SidebarToolbar() {
  return (
    <div className="mt-auto shrink-0">
      <div className="flex items-center justify-between border-t border-sidebar-border px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <YiruProfileSwitcher placement="sidebar" />
          <SidebarSettingsHelpMenu />
        </div>
        <ScrollToCurrentWorkspaceToolbarButton />
      </div>
    </div>
  )
})

export default SidebarToolbar
