import type React from 'react'
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FilePlus as FilePlus2, FolderPlus, Trash as Trash2 } from '@phosphor-icons/react'
import type {
  SpoolFileListResult,
  SpoolFileTreeEntry
} from '../../../../shared/spool/spool-operation-contract'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileExplorerToolbar } from '@/components/right-sidebar/file-explorer-toolbar'
import { FileExplorerVirtualList } from '@/components/right-sidebar/file-explorer-virtual-list'
import { FileExplorerTreeRowButton } from '@/components/right-sidebar/file-explorer-tree-row-button'
import { FileExplorerTreeStatus } from '@/components/right-sidebar/file-explorer-tree-status'
import { isDotfileRelativePath } from '@/components/right-sidebar/file-explorer-entries'
import type { TreeNode } from '@/components/right-sidebar/file-explorer-types'
import { useFileExplorerManualRefresh } from '@/components/right-sidebar/use-file-explorer-manual-refresh'
import { translate } from '@/i18n/i18n'
import { SpoolTooltipIconButton } from './spool-tooltip-icon-button'

type SpoolFileTreeRow =
  | { kind: 'entry'; entry: SpoolFileTreeEntry; node: TreeNode }
  | { kind: 'error'; directory: string; depth: number }

const FILE_EXPLORER_VIRTUALIZE_MIN_ROWS = 50

export function SpoolFileTree({
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
  listings: ReadonlyMap<string, SpoolFileListResult>
  loadingDirectories: ReadonlySet<string>
  unavailableDirectories: ReadonlySet<string>
  repoName: string
  selectedPath: string | null
  showDotfiles: boolean
  onCollapseAll: () => void
  onDelete: (entry: SpoolFileTreeEntry) => void
  onNewDirectory: (directory?: SpoolFileTreeEntry) => void
  onNewFile: (directory?: SpoolFileTreeEntry) => void
  onOpen: (entry: SpoolFileTreeEntry) => void
  onRefresh: () => Promise<void>
  onRetryDirectory: (relativePath: string) => void
  onRename: (entry: SpoolFileTreeEntry) => void
  onToggleDotfiles: () => void
}): React.JSX.Element {
  const rootListing = listings.get('') ?? null
  const rows = createSpoolFileTreeRows(listings, expanded, showDotfiles, unavailableDirectories)
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
    <aside className="flex min-h-0 w-full flex-1 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
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
              <SpoolTooltipIconButton
                onClick={() => onNewFile()}
                label={translate('auto.components.spool.SpoolFileTree.newFile', 'New file')}
              >
                <FilePlus2 aria-hidden="true" />
              </SpoolTooltipIconButton>
              <SpoolTooltipIconButton
                onClick={() => onNewDirectory()}
                label={translate(
                  'auto.components.spool.SpoolFileTree.newDirectory',
                  'New directory'
                )}
              >
                <FolderPlus aria-hidden="true" />
              </SpoolTooltipIconButton>
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
                    'auto.components.spool.SpoolFileTree.unavailable',
                    'Files are unavailable.'
                  )
                : null
            }
            isEmpty={isEmpty}
            emptyMessage={translate(
              'auto.components.spool.SpoolFileTree.empty',
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
                  className="flex h-7 items-center gap-2 pr-2 text-xs text-destructive"
                  style={{ paddingLeft: `${row.depth * 16 + 24}px` }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {translate(
                      'auto.components.spool.SpoolFileTree.unavailable',
                      'Files are unavailable.'
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onRetryDirectory(row.directory)}
                  >
                    {translate('auto.components.spool.SpoolFileTree.retry', 'Retry')}
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
                          {translate('auto.components.spool.SpoolFileTree.newFile', 'New file')}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => onNewDirectory(entry)}>
                          <FolderPlus aria-hidden="true" />
                          {translate(
                            'auto.components.spool.SpoolFileTree.newDirectory',
                            'New directory'
                          )}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                      </>
                    ) : null}
                    <ContextMenuItem onClick={() => onRename(entry)}>
                      {translate('auto.components.spool.SpoolFileTree.rename', 'Rename')}
                    </ContextMenuItem>
                    <ContextMenuItem variant="destructive" onClick={() => onDelete(entry)}>
                      <Trash2 aria-hidden="true" />
                      {translate('auto.components.spool.SpoolFileTree.delete', 'Delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
              </ContextMenu>
            )
          }}
        />
        {rootListing?.truncated || hasTruncatedDirectory ? (
          <p className="px-4 py-2 text-[11px] text-muted-foreground">
            {translate(
              'auto.components.spool.SpoolFileTree.truncated',
              'Only part of this directory is shown.'
            )}
          </p>
        ) : null}
      </ScrollArea>
    </aside>
  )
}

export function createSpoolFileTreeRows(
  listings: ReadonlyMap<string, SpoolFileListResult>,
  expanded: ReadonlySet<string>,
  showDotfiles: boolean,
  unavailableDirectories: ReadonlySet<string> = new Set()
): SpoolFileTreeRow[] {
  const rows: SpoolFileTreeRow[] = []
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

function sortFileEntries(entries: readonly SpoolFileTreeEntry[]): SpoolFileTreeEntry[] {
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
