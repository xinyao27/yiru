import { ShortcutKeyCombo } from '@/components/shortcut-key-combo'
import { TabBarOpenInMenuButton } from '@/components/tab-bar/open-in-menu-button'
import { TabBarQuickCommandsButton } from '@/components/tab-bar/quick-commands-button'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

import { getDropIndicatorClasses, getTitlebarSlotDropIndicator } from './titlebar-drop-indicator'
import type { WorkspacePanelTitlebarModel } from './use-workspace-panel-titlebar-model'

type WorkspacePanelTitlebarActionsProps = {
  model: WorkspacePanelTitlebarModel
}

export function WorkspacePanelTitlebarActions({
  model
}: WorkspacePanelTitlebarActionsProps): React.JSX.Element {
  const {
    worktreeId,
    groupId,
    visibleItems,
    activeTabContentType,
    dropTarget,
    resolvePanelIcon,
    shortcutFor,
    openPanel,
    handleItemPointerDown
  } = model
  const visibleCount = visibleItems.length

  return (
    <>
      {visibleItems.map((item, index) => {
        const dropIndicator = getTitlebarSlotDropIndicator({
          dropTarget,
          slotIndex: index,
          visibleCount
        })

        if (item.kind === 'open-in') {
          return (
            <TabBarOpenInMenuButton
              key={item.id}
              worktreeId={worktreeId}
              titlebarModel={model}
              titlebarIndex={index}
              titlebarSource="visible"
              dropIndicator={dropIndicator}
            />
          )
        }

        if (item.kind === 'commands') {
          return (
            <TabBarQuickCommandsButton
              key={item.id}
              worktreeId={worktreeId}
              groupId={groupId}
              presentation="titlebar-icon"
              titlebarModel={model}
              titlebarIndex={index}
              titlebarSource="visible"
              dropIndicator={dropIndicator}
            />
          )
        }

        const active = activeTabContentType === item.id
        const Icon = resolvePanelIcon(item.panel, active)
        const shortcut = shortcutFor(item.id)
        const label = item.panel.shortcut
          ? `${item.panel.title} (${item.panel.shortcut})`
          : item.panel.title
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline-transparent"
                  size="icon-titlebar-wide"
                  data-workspace-titlebar-slot={String(index)}
                  className={cn(
                    'relative text-muted-foreground cursor-grab active:cursor-grabbing [-webkit-app-region:no-drag]',
                    active && 'text-primary',
                    getDropIndicatorClasses(dropIndicator)
                  )}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => openPanel(item.id)}
                  onPointerDown={(event) => handleItemPointerDown(event, item.id, 'visible')}
                >
                  <Icon className="size-3.5" weight={item.panel.iconWeight} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={6} className="flex items-center gap-2">
              <span>{item.panel.title}</span>
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
    </>
  )
}
