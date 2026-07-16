import type React from 'react'
import {
  ChevronUp,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  Link2,
  MoreHorizontal,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type {
  SpoolFileListResult,
  SpoolFileTreeEntry
} from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SpoolTooltipIconButton } from './SpoolTooltipIconButton'
import { SpoolTruncatedPathLabel } from './SpoolTruncatedPathLabel'

export function SpoolFileTree({
  canControl,
  directory,
  listing,
  loading,
  unavailable,
  selectedPath,
  onDelete,
  onNewDirectory,
  onNewFile,
  onOpen,
  onRefresh,
  onRename,
  onUp
}: {
  canControl: boolean
  directory: string
  listing: SpoolFileListResult | null
  loading: boolean
  unavailable: boolean
  selectedPath: string | null
  onDelete: (entry: SpoolFileTreeEntry) => void
  onNewDirectory: () => void
  onNewFile: () => void
  onOpen: (entry: SpoolFileTreeEntry) => void
  onRefresh: () => void
  onRename: (entry: SpoolFileTreeEntry) => void
  onUp: () => void
}): React.JSX.Element {
  const entries = listing ? sortFileEntries(listing.entries) : []
  return (
    <aside className="flex min-h-0 w-full flex-1 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <header className="flex min-h-9 items-center gap-1 border-b border-border px-2 py-1">
        <SpoolTooltipIconButton
          disabled={!directory}
          onClick={onUp}
          label={translate('auto.components.spool.SpoolFileTree.up', 'Up one directory')}
        >
          <ChevronUp aria-hidden="true" />
        </SpoolTooltipIconButton>
        <SpoolTruncatedPathLabel
          path={directory}
          emptyLabel={translate('auto.components.spool.SpoolFileTree.root', 'Worktree root')}
          className="flex-1 px-1 text-muted-foreground"
        />
        <SpoolTooltipIconButton
          onClick={onRefresh}
          label={translate('auto.components.spool.SpoolFileTree.refresh', 'Refresh files')}
        >
          <RefreshCw aria-hidden="true" />
        </SpoolTooltipIconButton>
        <SpoolTooltipIconButton
          disabled={!canControl}
          onClick={onNewFile}
          label={translate('auto.components.spool.SpoolFileTree.newFile', 'New file')}
        >
          <FilePlus2 aria-hidden="true" />
        </SpoolTooltipIconButton>
        <SpoolTooltipIconButton
          disabled={!canControl}
          onClick={onNewDirectory}
          label={translate('auto.components.spool.SpoolFileTree.newDirectory', 'New directory')}
        >
          <FolderPlus aria-hidden="true" />
        </SpoolTooltipIconButton>
      </header>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-1">
        {loading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {translate('auto.components.spool.SpoolFileTree.loading', 'Loading files…')}
          </p>
        ) : unavailable ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {translate('auto.components.spool.SpoolFileTree.unavailable', 'Files are unavailable.')}
          </p>
        ) : entries.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {translate('auto.components.spool.SpoolFileTree.empty', 'This directory is empty.')}
          </p>
        ) : (
          entries.map((entry) => (
            <FileTreeRow
              key={entry.relativePath}
              entry={entry}
              selected={selectedPath === entry.relativePath}
              canControl={canControl}
              onOpen={() => onOpen(entry)}
              onRename={() => onRename(entry)}
              onDelete={() => onDelete(entry)}
            />
          ))
        )}
        {listing?.truncated ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">
            {translate(
              'auto.components.spool.SpoolFileTree.truncated',
              'Only part of this directory is shown.'
            )}
          </p>
        ) : null}
      </div>
    </aside>
  )
}

function FileTreeRow({
  canControl,
  entry,
  onDelete,
  onOpen,
  onRename,
  selected
}: {
  canControl: boolean
  entry: SpoolFileTreeEntry
  onDelete: () => void
  onOpen: () => void
  onRename: () => void
  selected: boolean
}): React.JSX.Element {
  const Icon = entry.kind === 'directory' ? Folder : entry.kind === 'symlink' ? Link2 : File
  return (
    <div
      data-current={selected ? 'true' : undefined}
      className={cn(
        'group flex items-center rounded-md text-[13px]',
        selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent'
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
        onClick={onOpen}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </button>
      {canControl ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="mr-1"
                      aria-label={translate(
                        'auto.components.spool.SpoolFileTree.itemActions',
                        'File actions'
                      )}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.spool.SpoolFileTree.itemActions', 'File actions')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>
              {translate('auto.components.spool.SpoolFileTree.rename', 'Rename')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden="true" />
              {translate('auto.components.spool.SpoolFileTree.delete', 'Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
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
