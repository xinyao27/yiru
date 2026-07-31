import type React from 'react'
import { useCallback, useMemo, useRef } from 'react'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '~renderer/components/ui/context-menu'
import { ScrollArea } from '~renderer/components/ui/scroll-area'
import { translate } from '~renderer/i18n/i18n'
import type { GitHistoryItem } from '~shared/git/history'
import type { GitBranchChangeEntry } from '~shared/types'

import type { SourceControlRowOpenEvent } from '../source-control/split-open'
import {
  clampGitGraphColumnWidth,
  type GitGraphColumnId,
  type GitGraphColumnWidths,
  gitGraphColumnFlexStyle
} from './column-widths'
import { GitGraphCommitContextMenu } from './commit-context-menu'
import { GitGraphCommitDetails } from './commit-details'
import { GitGraphCommitRow } from './commit-row'
import type { GitGraphCommitAction } from './commit-write-action'
import { GitGraphSvg } from './graph-svg'
import { GIT_GRAPH_DEFAULT_GRID, type GitGraphLayout, type GitGraphRowGap } from './layout'

type ResizeSession = { columnId: GitGraphColumnId; startX: number; startWidth: number }

function gitGraphColumnLabel(columnId: GitGraphColumnId): string {
  switch (columnId) {
    case 'description':
      return translate(
        'auto.components.workspace-panel.git-graph.CommitTable.b2c3d4e5f6',
        'Description'
      )
    case 'date':
      return translate('auto.components.workspace-panel.git-graph.CommitTable.c3d4e5f6a7', 'Date')
    case 'author':
      return translate('auto.components.workspace-panel.git-graph.CommitTable.d4e5f6a7b8', 'Author')
    case 'commit':
      return translate('auto.components.workspace-panel.git-graph.CommitTable.e5f6a7b8c9', 'Commit')
  }
}

function ColumnHeader({
  columnId,
  columnWidths,
  onResizeStart
}: {
  columnId: GitGraphColumnId
  columnWidths: GitGraphColumnWidths
  onResizeStart: (columnId: GitGraphColumnId, event: React.PointerEvent<HTMLDivElement>) => void
}): React.JSX.Element {
  return (
    <div
      className="text-muted-foreground relative flex h-full shrink-0 items-center truncate px-2 text-[11px] font-semibold tracking-wide uppercase"
      style={gitGraphColumnFlexStyle(columnId, columnWidths)}
    >
      {gitGraphColumnLabel(columnId)}
      <div
        role="separator"
        aria-orientation="vertical"
        className="hover:bg-ring/50 absolute top-0 right-0 h-full w-1 cursor-col-resize"
        onPointerDown={(event) => onResizeStart(columnId, event)}
      />
    </div>
  )
}

export function GitGraphCommitTable({
  items,
  layout,
  rowGap,
  currentCommitId,
  columnWidths,
  onColumnWidthsChange,
  expandedCommitId,
  onToggleExpand,
  onSelectParent,
  loadCommitFiles,
  onOpenFile,
  onOpenAllChanges,
  onCommitAction,
  findMatchIds,
  currentFindCommitId,
  rowRefs,
  onScrollNearBottom,
  hasMore,
  isLoadingMore,
  onLoadMore
}: {
  items: readonly GitHistoryItem[]
  layout: GitGraphLayout | null
  // Why: the same gap fed into buildGitGraphLayout, so the SVG's vertices and
  // baked edge paths shift by the identical pixel amount as the details block
  // that opens the gap below — see GitGraphCommitDetails.
  rowGap?: GitGraphRowGap
  currentCommitId?: string
  columnWidths: GitGraphColumnWidths
  onColumnWidthsChange: (widths: GitGraphColumnWidths) => void
  expandedCommitId: string | null
  onToggleExpand: (item: GitHistoryItem) => void
  onSelectParent: (parentId: string) => void
  loadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  onOpenFile: (entry: GitBranchChangeEntry, event?: SourceControlRowOpenEvent) => void
  onOpenAllChanges: (item: GitHistoryItem) => void
  onCommitAction: (action: GitGraphCommitAction, item: GitHistoryItem) => void
  findMatchIds: ReadonlySet<string>
  currentFindCommitId: string | null
  rowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  onScrollNearBottom: () => void
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}): React.JSX.Element {
  const resizeSessionRef = useRef<ResizeSession | null>(null)

  const handlePointerMove = useCallback(
    (event: PointerEvent): void => {
      const session = resizeSessionRef.current
      if (!session) {
        return
      }
      const delta = event.clientX - session.startX
      onColumnWidthsChange({
        ...columnWidths,
        [session.columnId]: clampGitGraphColumnWidth(session.startWidth + delta)
      })
    },
    [columnWidths, onColumnWidthsChange]
  )

  const stopResize = useCallback((): void => {
    resizeSessionRef.current = null
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', stopResize)
    document.body.style.cursor = ''
  }, [handlePointerMove])

  const startResize = useCallback(
    (columnId: GitGraphColumnId, event: React.PointerEvent<HTMLDivElement>): void => {
      event.preventDefault()
      resizeSessionRef.current = {
        columnId,
        startX: event.clientX,
        startWidth: columnWidths[columnId]
      }
      document.body.style.cursor = 'col-resize'
      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', stopResize)
    },
    [columnWidths, handlePointerMove, stopResize]
  )

  const graphColumnWidth = layout?.width ?? GIT_GRAPH_DEFAULT_GRID.offsetX * 2

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>): void => {
      const el = event.currentTarget
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= 25) {
        onScrollNearBottom()
      }
    },
    [onScrollNearBottom]
  )
  const viewportProps = useMemo(() => ({ onScroll: handleScroll }), [handleScroll])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border bg-card flex h-7 shrink-0 items-stretch border-b">
        <div className="shrink-0" style={{ width: graphColumnWidth }} aria-hidden="true" />
        {(['description', 'date', 'author', 'commit'] as const).map((columnId) => (
          <ColumnHeader
            key={columnId}
            columnId={columnId}
            columnWidths={columnWidths}
            onResizeStart={startResize}
          />
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportProps={viewportProps}>
        {/* Why: the graph SVG is absolutely positioned against the scrolled
            content, so it needs a positioned ancestor inside the viewport —
            the ScrollArea root itself stays fixed and would not scroll with it. */}
        <div className="relative">
          {layout && (
            <div
              className="pointer-events-none absolute top-0 left-0"
              style={{
                width: layout.width,
                height: items.length * GIT_GRAPH_DEFAULT_GRID.y + (rowGap?.height ?? 0)
              }}
            >
              <GitGraphSvg layout={layout} rowGap={rowGap} />
            </div>
          )}
          <div className="relative">
            {items.map((item) => {
              const row = (
                <GitGraphCommitRow
                  item={item}
                  graphColumnWidth={graphColumnWidth}
                  columnWidths={columnWidths}
                  isCurrent={item.id === currentCommitId}
                  isDetailsOpen={expandedCommitId === item.id}
                  isFindMatch={findMatchIds.has(item.id)}
                  isFindCurrent={currentFindCommitId === item.id}
                  onClick={() => onToggleExpand(item)}
                />
              )
              return (
                <div
                  key={item.id}
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(item.id, node)
                    } else {
                      rowRefs.current.delete(item.id)
                    }
                  }}
                >
                  <ContextMenu>
                    <ContextMenuTrigger render={row} />
                    <GitGraphCommitContextMenu item={item} onAction={onCommitAction} />
                  </ContextMenu>
                  {expandedCommitId === item.id && (
                    <GitGraphCommitDetails
                      item={item}
                      graphColumnWidth={graphColumnWidth}
                      loadCommitFiles={loadCommitFiles}
                      onOpenFile={onOpenFile}
                      onOpenAllChanges={() => onOpenAllChanges(item)}
                      onSelectParent={onSelectParent}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center py-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={isLoadingMore}
                onClick={onLoadMore}
              >
                {isLoadingMore ? (
                  <LoadingIndicator className="size-3" />
                ) : (
                  translate(
                    'auto.components.workspace-panel.git-graph.CommitTable.a1b2c3d4e5',
                    'Load More Commits'
                  )
                )}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
