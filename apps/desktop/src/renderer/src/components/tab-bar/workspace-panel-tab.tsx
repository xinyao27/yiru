import { useSortable } from '@dnd-kit/sortable'
import { Files, GitBranch, ListChecks, Plug } from '@phosphor-icons/react'

import { FlowArrow as Workflow } from '@/components/regular-icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import { AgentSessionHistoryIcon } from '../right-sidebar/agent-session-history-icon'
import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import {
  getDropIndicatorClasses,
  getTabRootStateClasses,
  type DropIndicator
} from './drop-indicator'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import { TabCloseButton } from './tab-close-button'
import { TAB_ROOT_CLASSES } from './tab-root-classes'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TAB_CONTAINER_WIDTH_CLASSES, TAB_LABEL_WIDTH_CLASSES } from './tab-width-rules'

function WorkspacePanelIcon({ panel }: { panel: WorkspacePanelTabContentType }): React.JSX.Element {
  const className = 'text-muted-foreground mr-1 size-4 shrink-0'
  switch (panel) {
    case 'explorer':
      return <Files className={className} />
    case 'vault':
      return <AgentSessionHistoryIcon className={className} />
    case 'workspaces':
      return <Workflow className={className} />
    case 'pr-checks':
    case 'checks':
      return <ListChecks className={className} />
    case 'source-control':
      return <GitBranch className={className} />
    case 'ports':
      return <Plug className={className} />
  }
}

export function WorkspacePanelTab({
  id,
  panel,
  label,
  isActive,
  onActivate,
  onClose,
  dragData,
  dropIndicator
}: {
  id: string
  panel: WorkspacePanelTabContentType
  label: string
  isActive: boolean
  onActivate: () => void
  onClose: () => void
  dragData: TabDragItemData
  dropIndicator?: DropIndicator
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef } = useSortable({ id, data: dragData })
  const { onPointerDown } = useTabStripPointerActivation({ onActivate })

  return (
    <div className={TAB_CONTAINER_WIDTH_CLASSES}>
      <div
        ref={setNodeRef}
        data-tab-id={id}
        {...attributes}
        {...listeners}
        className={cn(
          TAB_ROOT_CLASSES,
          getDropIndicatorClasses(dropIndicator ?? null),
          getTabRootStateClasses(isActive)
        )}
        onPointerDown={(event) => {
          onPointerDown(
            event,
            listeners?.onPointerDown as
              | ((pointerEvent: React.PointerEvent<Element>) => void)
              | undefined
          )
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
        <WorkspacePanelIcon panel={panel} />
        <Tooltip>
          <TooltipTrigger
            render={<span className={cn(TAB_LABEL_WIDTH_CLASSES, 'mr-1')}>{label}</span>}
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {label}
          </TooltipContent>
        </Tooltip>
        <TabCloseButton
          className="right-1"
          ariaLabel={translate(
            'auto.components.tab.bar.WorkspacePanelTab.close',
            'Close tab {{value0}}',
            {
              value0: label
            }
          )}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
