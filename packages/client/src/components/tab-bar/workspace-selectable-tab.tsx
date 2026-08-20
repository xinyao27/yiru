import type React from 'react'
import { cn } from '~renderer/lib/class-names'

import {
  getTitlebarTabStateClasses,
  TAB_LEADING_ICON_CLASSES,
  TAB_ROOT_CLASSES
} from './tab-chrome-classes'
import { TabLabel } from './tab-label'
import { TAB_CONTAINER_WIDTH_CLASSES } from './tab-width-rules'

type WorkspaceSelectableTabProps = {
  id: string
  title: string
  active: boolean
  icon: React.ReactNode
  onSelect: (id: string) => void
  tabIndex: 0 | -1
}

export function WorkspaceSelectableTab({
  id,
  title,
  active,
  icon,
  onSelect,
  tabIndex
}: WorkspaceSelectableTabProps): React.JSX.Element {
  // Why: remote workspaces need the native tab chrome without inheriting local drag,
  // close, rename, pin, or persistence behavior.
  return (
    <div className={TAB_CONTAINER_WIDTH_CLASSES}>
      <div
        role="tab"
        aria-selected={active}
        tabIndex={tabIndex}
        data-tab-id={id}
        data-active={active ? 'true' : 'false'}
        className={cn(TAB_ROOT_CLASSES, getTitlebarTabStateClasses(active))}
        onClick={() => onSelect(id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(id)
          }
        }}
      >
        <span
          className={cn(TAB_LEADING_ICON_CLASSES, 'flex items-center justify-center')}
          aria-hidden
        >
          {icon}
        </span>
        <TabLabel label={title} />
      </div>
    </div>
  )
}
