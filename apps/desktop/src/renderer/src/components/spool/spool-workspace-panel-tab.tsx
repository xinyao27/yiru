import type React from 'react'

import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar-buttons'
import { getTitlebarTabStateClasses } from '@/components/tab-bar/drop-indicator'
import { preventMiddleButtonDefault } from '@/components/tab-bar/middle-button-default-guard'
import { TabCloseButton } from '@/components/tab-bar/tab-close-button'
import { TAB_LEADING_ICON_CLASSES, TAB_ROOT_CLASSES } from '@/components/tab-bar/tab-root-classes'
import {
  TAB_CONTAINER_WIDTH_CLASSES,
  TAB_LABEL_WIDTH_CLASSES
} from '@/components/tab-bar/tab-width-rules'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { WorkspacePanelTabContentType } from '../../../../shared/types'

export function getSpoolWorkspacePanelTabId(panel: WorkspacePanelTabContentType): string {
  return `workspace-panel:${panel}`
}

export function SpoolWorkspacePanelTab({
  item,
  active,
  onSelect,
  onClose,
  tabIndex
}: {
  item: ActivityBarItem
  active: boolean
  onSelect: () => void
  onClose: () => void
  tabIndex: 0 | -1
}): React.JSX.Element {
  const Icon = item.icon
  const id = getSpoolWorkspacePanelTabId(item.id)
  return (
    <div className={TAB_CONTAINER_WIDTH_CLASSES}>
      <div
        role="tab"
        aria-selected={active}
        tabIndex={tabIndex}
        data-tab-id={id}
        data-active={active ? 'true' : 'false'}
        className={cn(TAB_ROOT_CLASSES, 'w-full', getTitlebarTabStateClasses(active))}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          }
        }}
        onMouseDown={(event) => {
          if (event.button === 1) {
            event.preventDefault()
          }
        }}
        onMouseUp={preventMiddleButtonDefault}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <Icon className={TAB_LEADING_ICON_CLASSES} />
        <Tooltip>
          <TooltipTrigger
            render={<span className={cn(TAB_LABEL_WIDTH_CLASSES, 'mr-1')}>{item.title}</span>}
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {item.title}
          </TooltipContent>
        </Tooltip>
        <TabCloseButton
          className="right-1"
          ariaLabel={translate(
            'auto.components.tab.bar.SortableTab.6df69d9388',
            'Close tab {{value0}}',
            { value0: item.title }
          )}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
