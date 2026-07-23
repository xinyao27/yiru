import type React from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

import { getTitlebarTabStateClasses } from './drop-indicator'
import { TAB_LEADING_ICON_CLASSES, TAB_ROOT_CLASSES } from './tab-root-classes'
import { TAB_CONTAINER_WIDTH_CLASSES, TAB_LABEL_WIDTH_CLASSES } from './tab-width-rules'

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
      <button
        type="button"
        role="tab"
        aria-selected={active}
        tabIndex={tabIndex}
        data-tab-id={id}
        data-active={active ? 'true' : 'false'}
        className={cn(TAB_ROOT_CLASSES, 'w-full text-left', getTitlebarTabStateClasses(active))}
        onClick={() => onSelect(id)}
      >
        <span
          className={cn(TAB_LEADING_ICON_CLASSES, 'flex items-center justify-center')}
          aria-hidden
        >
          {icon}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={<span className={cn(TAB_LABEL_WIDTH_CLASSES, 'mr-1 text-left')}>{title}</span>}
          />
          <TooltipContent
            side="bottom"
            sideOffset={6}
            className="max-w-80 text-left break-words whitespace-normal"
          >
            {title}
          </TooltipContent>
        </Tooltip>
      </button>
    </div>
  )
}
