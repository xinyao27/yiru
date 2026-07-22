import {
  Folder,
  FolderOpen,
  SidebarSimple as PanelLeftClose,
  CaretDown as ChevronDown
} from '@phosphor-icons/react'
import React from 'react'

import {
  buildSourceControlTree,
  compactSourceControlTree,
  flattenSourceControlTree,
  type SourceControlTreeNode
} from '@/components/right-sidebar/source-control-tree'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import type { ConflictReviewEntry } from '@/store/slices/editor'

import type { GitStatusEntry } from '../../../../shared/types'

type ConflictReviewTreeEntry = ConflictReviewEntry & {
  liveEntry?: GitStatusEntry
}

type ConflictReviewTreeNode = SourceControlTreeNode<ConflictReviewTreeEntry, 'conflict-review'>

const CONFLICT_REVIEW_TREE_INDENT_PX = 12
const CONFLICT_REVIEW_DIRECTORY_PADDING_PX = 8
const CONFLICT_REVIEW_FILE_PADDING_PX = 20

function buildConflictReviewRows(
  entries: readonly ConflictReviewTreeEntry[],
  collapsedDirectoryKeys: ReadonlySet<string>
): ConflictReviewTreeNode[] {
  const roots = compactSourceControlTree(
    buildSourceControlTree('conflict-review', [...entries])
  ) as ConflictReviewTreeNode[]
  return flattenSourceControlTree(roots, collapsedDirectoryKeys) as ConflictReviewTreeNode[]
}

export function ConflictReviewFileTree({
  entries,
  collapsed,
  onCollapsedChange,
  selectedPath,
  onOpenEntry
}: {
  entries: readonly ConflictReviewTreeEntry[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  selectedPath: string | null
  onOpenEntry: (entry: GitStatusEntry) => void
}): React.JSX.Element | null {
  const [collapsedDirectoryKeys, setCollapsedDirectoryKeys] = React.useState<Set<string>>(
    () => new Set()
  )
  const rows = React.useMemo(
    () => buildConflictReviewRows(entries, collapsedDirectoryKeys),
    [collapsedDirectoryKeys, entries]
  )
  const toggleDirectory = React.useCallback((key: string) => {
    setCollapsedDirectoryKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  if (collapsed) {
    return null
  }

  return (
    <aside className="border-border bg-background flex w-72 shrink-0 flex-col border-r">
      <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.05em] uppercase">
          {translate('auto.components.editor.ConflictReviewFileTree.99496bab6e', 'Files')}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground text-[11px] tabular-nums">{entries.length}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.editor.ConflictReviewFileTree.a54551c5a6',
              'Collapse file tree'
            )}
            onClick={() => onCollapsedChange(true)}
          >
            <PanelLeftClose className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto py-1">
        {rows.length === 0 ? (
          <div className="text-muted-foreground px-3 py-6 text-center text-xs">
            {translate(
              'auto.components.editor.ConflictReviewFileTree.3449521a8c',
              'No conflicts in this snapshot.'
            )}
          </div>
        ) : (
          rows.map((node) => (
            <ConflictReviewFileTreeRow
              key={node.key}
              node={node}
              isCollapsed={collapsedDirectoryKeys.has(node.key)}
              isSelected={node.type === 'file' && node.entry.path === selectedPath}
              onToggleDirectory={toggleDirectory}
              onOpenEntry={onOpenEntry}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function ConflictReviewFileTreeRow({
  node,
  isCollapsed,
  isSelected,
  onToggleDirectory,
  onOpenEntry
}: {
  node: ConflictReviewTreeNode
  isCollapsed: boolean
  isSelected: boolean
  onToggleDirectory: (key: string) => void
  onOpenEntry: (entry: GitStatusEntry) => void
}): React.JSX.Element {
  if (node.type === 'directory') {
    return (
      <button
        type="button"
        className="group text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:bg-accent/40 focus-visible:text-foreground flex w-full items-center gap-1 py-1 pr-3 text-left text-xs transition-colors outline-none"
        style={{
          paddingLeft: `${node.depth * CONFLICT_REVIEW_TREE_INDENT_PX + CONFLICT_REVIEW_DIRECTORY_PADDING_PX}px`
        }}
        onClick={() => onToggleDirectory(node.key)}
        aria-expanded={!isCollapsed}
      >
        <ChevronDown
          className={cn('size-3 shrink-0 transition-transform', isCollapsed && '-rotate-90')}
        />
        {isCollapsed ? (
          <Folder className="size-3 shrink-0" />
        ) : (
          <FolderOpen className="size-3 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="text-muted-foreground/80 w-4 shrink-0 text-center text-[10px] font-bold tabular-nums">
          {node.fileCount}
        </span>
      </button>
    )
  }

  const FileIcon = getFileTypeIcon(node.entry.path)
  const liveEntry = node.entry.liveEntry
  const isStillUnresolved = liveEntry?.conflictStatus === 'unresolved'

  return (
    <button
      type="button"
      className={cn(
        'outline-none focus-visible:bg-accent/40 focus-visible:bg-accent/70',
        'group flex w-full min-w-0 cursor-pointer items-center gap-1 py-1 pr-3 text-left text-xs transition-colors hover:bg-accent/40 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent',
        isSelected && 'bg-accent/60 text-accent-foreground hover:bg-accent/70'
      )}
      style={{
        paddingLeft: `${node.depth * CONFLICT_REVIEW_TREE_INDENT_PX + CONFLICT_REVIEW_FILE_PADDING_PX}px`
      }}
      disabled={!liveEntry}
      title={node.entry.path}
      onClick={() => {
        if (liveEntry) {
          onOpenEntry(liveEntry)
        }
      }}
    >
      <FileIcon className={cn('size-3.5 shrink-0', isStillUnresolved && 'text-destructive')} />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-foreground">{node.name}</span>
      </span>
      <span
        className={cn(
          'ml-1 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
          isStillUnresolved
            ? 'bg-destructive/12 text-destructive'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {isStillUnresolved
          ? translate('auto.components.editor.ConflictReviewFileTree.69d4e210bb', 'Unresolved')
          : liveEntry
            ? translate('auto.components.editor.ConflictReviewFileTree.8528a5eaf5', 'Resolved')
            : translate('auto.components.editor.ConflictReviewFileTree.496e28a932', 'Gone')}
      </span>
    </button>
  )
}
