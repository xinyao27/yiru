import { useSortable } from '@dnd-kit/sortable'
import {
  ClockCounterClockwise,
  Folder,
  FolderOpen,
  FlowArrow as Workflow,
  GitMerge,
  ListChecks,
  Plug
} from '@phosphor-icons/react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import { getDropIndicatorClasses, type DropIndicator } from './drop-indicator'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import {
  getTitlebarTabStateClasses,
  TAB_LEADING_ICON_CLASSES,
  TAB_ROOT_CLASSES
} from './tab-chrome-classes'
import { TabCloseButton } from './tab-close-button'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TAB_CONTAINER_WIDTH_CLASSES, TAB_LABEL_WIDTH_CLASSES } from './tab-width-rules'

function WorkspacePanelIcon({
  panel,
  isActive
}: {
  panel: WorkspacePanelTabContentType
  isActive: boolean
}): React.JSX.Element {
  const className = TAB_LEADING_ICON_CLASSES
  switch (panel) {
    case 'explorer':
      return isActive ? <FolderOpen className={className} /> : <Folder className={className} />
    case 'vault':
      return <ClockCounterClockwise className={className} />
    case 'workspaces':
      return <Workflow weight="regular" className={className} />
    case 'pr-checks':
    case 'checks':
      return <ListChecks className={className} />
    case 'source-control':
      return <GitMerge className={className} />
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
          getTitlebarTabStateClasses(isActive)
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
        <WorkspacePanelIcon panel={panel} isActive={isActive} />
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
            'auto.components.tab.bar.SortableTab.6df69d9388',
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
