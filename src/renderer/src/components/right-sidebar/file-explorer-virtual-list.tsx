import React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'

type FileExplorerVirtualListProps = {
  virtualizer: Virtualizer<HTMLDivElement, Element>
  plainRowCount?: number
  getRowKey?: (index: number) => React.Key
  renderRow: (index: number) => React.ReactNode
}

/** The shared windowing surface for local and remote Worktree Explorer rows. */
export function FileExplorerVirtualList(props: FileExplorerVirtualListProps): React.JSX.Element {
  return renderFileExplorerVirtualList(props)
}

export function renderFileExplorerVirtualList({
  virtualizer,
  plainRowCount,
  getRowKey,
  renderRow
}: FileExplorerVirtualListProps): React.JSX.Element {
  if (plainRowCount !== undefined) {
    return (
      <>
        {Array.from({ length: plainRowCount }, (_, index) => (
          <React.Fragment key={getRowKey?.(index) ?? index}>{renderRow(index)}</React.Fragment>
        ))}
      </>
    )
  }
  return (
    <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          data-index={item.index}
          ref={virtualizer.measureElement}
          className="absolute left-0 right-0 top-0"
          style={{ transform: `translateY(${item.start}px)` }}
        >
          {renderRow(item.index)}
        </div>
      ))}
    </div>
  )
}
