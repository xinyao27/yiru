import { Trash as Trash2, FilePlus as FilePlus2, FolderPlus } from '@phosphor-icons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type React from 'react'
import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { translate } from '@/i18n/i18n'

import type {
  CoworkingFileListResult,
  CoworkingFileTreeEntry
} from '../../../../shared/coworking/operation-contract'
import { isDotfileRelativePath } from '../workspace-panel/file-explorer/entries'
import { FileExplorerToolbar } from '../workspace-panel/file-explorer/toolbar'
import { FileExplorerTreeRowButton } from '../workspace-panel/file-explorer/tree-row-button'
import { FileExplorerTreeStatus } from '../workspace-panel/file-explorer/tree-status'
import type { TreeNode } from '../workspace-panel/file-explorer/types'
import { useFileExplorerManualRefresh } from '../workspace-panel/file-explorer/use-manual-refresh'
import { FileExplorerVirtualList } from '../workspace-panel/file-explorer/virtual-list'
import { CoworkingTooltipIconButton } from './tooltip-icon-button'

type CoworkingFileTreeRow =
  | { kind: 'entry'; entry: CoworkingFileTreeEntry; node: TreeNode }
  | { kind: 'error'; directory: string; depth: number }

const FILE_EXPLORER_VIRTUALIZE_MIN_ROWS = 50

export function CoworkingFileTree({
  canControl,
  expanded,
  listings,
  loadingDirectories,
  unavailableDirectories,
  repoName,
  selectedPath,
  showDotfiles,
  onCollapseAll,
  onDelete,
  onNewDirectory,
  onNewFile,
  onOpen,
  onRefresh,
  onRetryDirectory,
  onRename,
  onToggleDotfiles
}: {
  canControl: boolean
  expanded: ReadonlySet<string>
  listings: ReadonlyMap<string, CoworkingFileListResult>
  loadingDirectories: ReadonlySet<string>
  unavailableDirectories: ReadonlySet<string>
  repoName: string
  selectedPath: string | null
  showDotfiles: boolean
  onCollapseAll: () => void
  onDelete: (entry: CoworkingFileTreeEntry) => void
  onNewDirectory: (directory?: CoworkingFileTreeEntry) => void
  onNewFile: (directory?: CoworkingFileTreeEntry) => void
  onOpen: (entry: CoworkingFileTreeEntry) => void
  onRefresh: () => Promise<void>
  onRetryDirectory: (relativePath: string) => void
  onRename: (entry: CoworkingFileTreeEntry) => void
  onToggleDotfiles: () => void
}): React.JSX.Element {
  const rootListing = listings.get('') ?? null
  const rows = createCoworkingFileTreeRows(listings, expanded, showDotfiles, unavailableDirectories)
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizeRows = rows.length >= FILE_EXPLORER_VIRTUALIZE_MIN_ROWS
  const virtualizer = useVirtualizer({
    count: rows.length,
    enabled: virtualizeRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 20,
    initialRect: { width: 0, height: 600 },
    getItemKey: (index) => {
      const row = rows[index]
      return row?.kind === 'entry' ? row.entry.relativePath : `error:${row?.directory ?? index}`
    }
  })
  const refresh = useFileExplorerManualRefresh(onRefresh)
  const rootLoading = loadingDirectories.has('') && !rootListing
  const rootUnavailable = unavailableDirectories.has('') && !rootListing
  const isEmpty = Boolean(rootListing) && rows.length === 0
  const hasTruncatedDirectory = rows.some(
    (row) =>
      row.kind === 'entry' &&
      row.entry.kind === 'directory' &&
      listings.get(row.entry.relativePath)?.truncated
  )

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex min-h-0 w-full flex-1 shrink-0 flex-col">
      <FileExplorerToolbar
        repoName={repoName}
        refresh={refresh}
        canRefresh
        canCollapseAll={expanded.size > 0}
        onCollapseAll={onCollapseAll}
        showGitIgnoredFilesToggle={false}
        showGitIgnoredFiles
        onToggleGitIgnoredFiles={() => {}}
        showDotfiles={showDotfiles}
        onToggleDotfiles={onToggleDotfiles}
        mutationActions={
          canControl ? (
            <>
              <CoworkingTooltipIconButton
                onClick={() => onNewFile()}
                label={translate('auto.components.coworking.CoworkingFileTree.newFile', 'New file')}
              >
                <FilePlus2 aria-hidden="true" />
              </CoworkingTooltipIconButton>
              <CoworkingTooltipIconButton
                onClick={() => onNewDirectory()}
                label={translate(
                  'auto.components.coworking.CoworkingFileTree.newDirectory',
                  'New directory'
                )}
              >
                <FolderPlus aria-hidden="true" />
              </CoworkingTooltipIconButton>
            </>
          ) : null
        }
      />
      <ScrollArea
        viewportRef={scrollRef}
        viewportClassName="h-full min-h-0 py-2"
        className="min-h-0 flex-1"
      >
        {rootLoading || rootUnavailable || isEmpty ? (
          <FileExplorerTreeStatus
            isLoading={rootLoading}
            error={
              rootUnavailable
                ? translate(
                    'auto.components.coworking.CoworkingFileTree.unavailable',
                    'Files are unavailable.'
                  )
                : null
            }
            isEmpty={isEmpty}
            emptyMessage={translate(
              'auto.components.coworking.CoworkingFileTree.empty',
              'This directory is empty.'
            )}
          />
        ) : null}
        <FileExplorerVirtualList
          virtualizer={virtualizer}
          plainRowCount={virtualizeRows ? undefined : rows.length}
          getRowKey={(index) => {
            const row = rows[index]
            return row?.kind === 'entry'
              ? row.entry.relativePath
              : `error:${row?.directory ?? index}`
          }}
          renderRow={(index) => {
            const row = rows[index]
            if (!row) {
              return null
            }
            if (row.kind === 'error') {
              return (
                <div
                  className="text-destructive flex h-7 items-center gap-2 pr-2 text-xs"
                  style={{ paddingLeft: `${row.depth * 16 + 24}px` }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {translate(
                      'auto.components.coworking.CoworkingFileTree.unavailable',
                      'Files are unavailable.'
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onRetryDirectory(row.directory)}
                  >
                    {translate('auto.components.coworking.CoworkingFileTree.retry', 'Retry')}
                  </Button>
                </div>
              )
            }
            const { entry, node } = row
            return (
              <ContextMenu>
                <ContextMenuTrigger
                  className="block w-full min-w-0"
                  render={
                    <FileExplorerTreeRowButton
                      node={node}
                      isExpanded={entry.kind === 'directory' && expanded.has(entry.relativePath)}
                      isLoading={
                        entry.kind === 'directory' && loadingDirectories.has(entry.relativePath)
                      }
                      isSelected={selectedPath === entry.relativePath}
                      aria-expanded={
                        entry.kind === 'directory' ? expanded.has(entry.relativePath) : undefined
                      }
                      onClick={() => onOpen(entry)}
                    />
                  }
                />
                {canControl ? (
                  <ContextMenuContent>
                    {entry.kind === 'directory' ? (
                      <>
                        <ContextMenuItem onClick={() => onNewFile(entry)}>
                          <FilePlus2 aria-hidden="true" />
                          {translate(
                            'auto.components.coworking.CoworkingFileTree.newFile',
                            'New file'
                          )}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => onNewDirectory(entry)}>
                          <FolderPlus aria-hidden="true" />
                          {translate(
                            'auto.components.coworking.CoworkingFileTree.newDirectory',
                            'New directory'
                          )}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                      </>
                    ) : null}
                    <ContextMenuItem onClick={() => onRename(entry)}>
                      {translate('auto.components.coworking.CoworkingFileTree.rename', 'Rename')}
                    </ContextMenuItem>
                    <ContextMenuItem variant="destructive" onClick={() => onDelete(entry)}>
                      <Trash2 aria-hidden="true" />
                      {translate('auto.components.coworking.CoworkingFileTree.delete', 'Delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
              </ContextMenu>
            )
          }}
        />
        {rootListing?.truncated || hasTruncatedDirectory ? (
          <p className="text-muted-foreground px-4 py-2 text-[11px]">
            {translate(
              'auto.components.coworking.CoworkingFileTree.truncated',
              'Only part of this directory is shown.'
            )}
          </p>
        ) : null}
      </ScrollArea>
    </aside>
  )
}

export function createCoworkingFileTreeRows(
  listings: ReadonlyMap<string, CoworkingFileListResult>,
  expanded: ReadonlySet<string>,
  showDotfiles: boolean,
  unavailableDirectories: ReadonlySet<string> = new Set()
): CoworkingFileTreeRow[] {
  const rows: CoworkingFileTreeRow[] = []
  const visit = (directory: string, depth: number): void => {
    const listing = listings.get(directory)
    if (unavailableDirectories.has(directory) && (directory !== '' || listing)) {
      rows.push({ kind: 'error', directory, depth })
    }
    if (!listing) {
      return
    }
    for (const entry of sortFileEntries(listing.entries)) {
      if (!showDotfiles && isDotfileRelativePath(entry.relativePath)) {
        continue
      }
      rows.push({
        kind: 'entry',
        entry,
        node: {
          name: entry.name,
          path: entry.relativePath,
          relativePath: entry.relativePath,
          isDirectory: entry.kind === 'directory',
          isSymlink: entry.kind === 'symlink',
          depth,
          operationOwner: { kind: 'unresolved' }
        }
      })
      if (entry.kind === 'directory' && expanded.has(entry.relativePath)) {
        visit(entry.relativePath, depth + 1)
      }
    }
  }
  visit('', 0)
  return rows
}

function sortFileEntries(entries: readonly CoworkingFileTreeEntry[]): CoworkingFileTreeEntry[] {
  return [...entries].sort((left, right) => {
    if (left.kind === 'directory' && right.kind !== 'directory') {
      return -1
    }
    if (left.kind !== 'directory' && right.kind === 'directory') {
      return 1
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}
