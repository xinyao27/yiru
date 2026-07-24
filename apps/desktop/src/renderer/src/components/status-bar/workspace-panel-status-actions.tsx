import { ShortcutKeyCombo } from '@/components/shortcut-key-combo'
import { useShortcutKeyDetails } from '@/hooks/use-shortcut-label'
import { openWorkspacePanelTab } from '@/lib/open-workspace-panel-tab'
import { canShowRightSidebarForView } from '@/lib/right-sidebar-visibility'
import { useAppStore } from '@/store'

import { useRightSidebarActivityItems } from '../right-sidebar/use-right-sidebar-activity-items'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function WorkspacePanelStatusActions(): React.JSX.Element | null {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeView = useAppStore((state) => state.activeView)
  // Why: several panel tabs may remain open; only the panel currently visible
  // in the focused group should receive the selected color.
  const activeTabContentType = useAppStore((state) => {
    const worktreeId = state.activeWorktreeId
    return worktreeId ? (state.getActiveTab(worktreeId)?.contentType ?? null) : null
  })
  const { items } = useRightSidebarActivityItems(activeWorktreeId)
  const explorerShortcut = useShortcutKeyDetails('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutKeyDetails('sidebar.sourceControl.toggle')
  const checksShortcut = useShortcutKeyDetails('sidebar.checks.toggle')
  const portsShortcut = useShortcutKeyDetails('sidebar.ports.toggle')

  // Why: the status bar also persists on global pages, where a workspace panel
  // has no safe target group to open into.
  if (!activeWorktreeId || !canShowRightSidebarForView(activeView)) {
    return null
  }

  return (
    <div className="flex h-full shrink-0 items-center gap-0.5">
      {items.map((item) => {
        const Icon = item.icon
        const active = activeTabContentType === item.id
        const label = item.shortcut ? `${item.title} (${item.shortcut})` : item.title
        const shortcut =
          item.id === 'explorer'
            ? explorerShortcut
            : item.id === 'source-control'
              ? sourceControlShortcut
              : item.id === 'checks'
                ? checksShortcut
                : item.id === 'ports'
                  ? portsShortcut
                  : null

        return (
          <Tooltip key={item.id}>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="status-bar-icon"
                  size="icon-status-bar"
                  // Why: compact status actions mark selection through icon
                  // contrast only; the footer variant keeps hover/focus transient.
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  onClick={() =>
                    openWorkspacePanelTab({ panel: item.id, worktreeId: activeWorktreeId })
                  }
                >
                  <Icon className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={6} className="flex items-center gap-2">
              <span>{item.title}</span>
              {shortcut && shortcut.keys.length > 0 ? (
                <ShortcutKeyCombo
                  keys={shortcut.keys}
                  variant="inverted"
                  doubleTap={shortcut.doubleTap}
                />
              ) : null}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
