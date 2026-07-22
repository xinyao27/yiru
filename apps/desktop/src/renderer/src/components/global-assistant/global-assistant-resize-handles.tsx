import type { PointerEvent } from 'react'

import type { GlobalAssistantResizeDirection } from './global-assistant-panel-bounds'

type Props = {
  onResizeStart: (
    direction: GlobalAssistantResizeDirection,
    event: PointerEvent<HTMLDivElement>
  ) => void
}

const handles: {
  direction: GlobalAssistantResizeDirection
  className: string
}[] = [
  { direction: 'n', className: 'top-0 left-2 right-2 h-1 cursor-n-resize' },
  { direction: 'ne', className: 'top-0 right-0 size-2 cursor-ne-resize' },
  { direction: 'e', className: 'top-2 right-0 bottom-2 w-1 cursor-e-resize' },
  { direction: 'se', className: 'right-0 bottom-0 size-2 cursor-se-resize' },
  { direction: 's', className: 'right-2 bottom-0 left-2 h-1 cursor-s-resize' },
  { direction: 'sw', className: 'bottom-0 left-0 size-2 cursor-sw-resize' },
  { direction: 'w', className: 'top-2 bottom-2 left-0 w-1 cursor-w-resize' },
  { direction: 'nw', className: 'top-0 left-0 size-2 cursor-nw-resize' }
]

export function GlobalAssistantResizeHandles({ onResizeStart }: Props): React.JSX.Element {
  return (
    <>
      {handles.map(({ direction, className }) => (
        <div
          key={direction}
          aria-hidden="true"
          className={`absolute z-20 ${className}`}
          onPointerDown={(event) => onResizeStart(direction, event)}
        />
      ))}
    </>
  )
}
