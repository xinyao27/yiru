import type React from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

import { getTabDividerClasses, getTabRootStateClasses } from './drop-indicator'
import { TAB_CONTAINER_WIDTH_CLASSES, TAB_LABEL_WIDTH_CLASSES } from './tab-width-rules'

type WorkspaceSelectableTabProps = {
  id: string
  title: string
  active: boolean
  hasTabsToRight: boolean
  icon: React.ReactNode
  onSelect: (id: string) => void
  tabIndex: 0 | -1
}

export function WorkspaceSelectableTab({
  id,
  title,
  active,
  hasTabsToRight,
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
        className={cn(
          'group relative flex h-full w-full cursor-pointer select-none items-center px-1.5 text-xs outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          getTabDividerClasses(hasTabsToRight),
          getTabRootStateClasses(active)
        )}
        onClick={() => onSelect(id)}
      >
        <span className="mr-1.5 flex size-4 shrink-0 items-center justify-center" aria-hidden>
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
