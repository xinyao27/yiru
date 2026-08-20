import type React from 'react'
import { preventMiddleButtonDefault } from '~renderer/components/tab-bar/middle-button-default-guard'
import {
  getTitlebarTabStateClasses,
  TAB_LEADING_ICON_CLASSES,
  TAB_ROOT_CLASSES
} from '~renderer/components/tab-bar/tab-chrome-classes'
import { TabCloseButton } from '~renderer/components/tab-bar/tab-close-button'
import { TabLabel } from '~renderer/components/tab-bar/tab-label'
import { TAB_CONTAINER_WIDTH_CLASSES } from '~renderer/components/tab-bar/tab-width-rules'
import type { ActivityBarItem } from '~renderer/components/workspace-panel/activity-bar-buttons'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import type { WorkspacePanelTabContentType } from '~shared/types'

export function getCoworkingWorkspacePanelTabId(panel: WorkspacePanelTabContentType): string {
  return `workspace-panel:${panel}`
}

export function CoworkingWorkspacePanelTab({
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
  const id = getCoworkingWorkspacePanelTabId(item.id)
  return (
    <div className={TAB_CONTAINER_WIDTH_CLASSES}>
      <div
        role="tab"
        aria-selected={active}
        tabIndex={tabIndex}
        data-tab-id={id}
        data-active={active ? 'true' : 'false'}
        className={cn(TAB_ROOT_CLASSES, getTitlebarTabStateClasses(active))}
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
        <TabLabel label={item.title} />
        <TabCloseButton
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
