import {
  Minus,
  Folder,
  FolderOpen,
  Trash,
  CaretDown as ChevronDown,
  Plus,
  ArrowCounterClockwise as Undo2
} from '@phosphor-icons/react'
import React from 'react'

import { translate } from '../../../i18n/i18n'
import { cn } from '../../../lib/class-names'
import { Button } from '../../ui/button'
import type { DiscardAllArea } from '../discard-all-sequence'
import { ActionButton } from './action-button'
import type {
  BranchSourceControlTreeDirectoryNode,
  SourceControlDirectoryActionPaths,
  SourceControlTreeDirectoryNode
} from './directory-action-paths'
import { SourceControlRowActions, SourceControlTreeRow } from './tree-row'

type DirectoryRowNode = Pick<SourceControlTreeDirectoryNode, 'depth' | 'fileCount' | 'name'>

function DirectoryRow({
  node,
  isCollapsed,
  onToggle,
  actions
}: {
  node: DirectoryRowNode
  isCollapsed: boolean
  onToggle: () => void
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <SourceControlTreeRow depth={node.depth} rowType="directory">
      <Button
        variant="ghost"
        size="xs"
        type="button"
        className="flex h-auto min-w-0 flex-1 justify-start border-0 p-0 text-left font-normal whitespace-normal"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
      >
        <ChevronDown
          weight="regular"
          className={cn('size-3 shrink-0 transition-transform', isCollapsed && '-rotate-90')}
        />
        {isCollapsed ? (
          <Folder className="size-3 shrink-0" />
        ) : (
          <FolderOpen className="size-3 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </Button>
      <span className="text-muted-foreground/80 w-4 shrink-0 text-center text-[10px] font-bold tabular-nums">
        {node.fileCount}
      </span>
      {actions && <SourceControlRowActions>{actions}</SourceControlRowActions>}
    </SourceControlTreeRow>
  )
}

export function SourceControlTreeDirectoryRow({
  node,
  actionPaths,
  hideBulkActions,
  isExecutingBulk,
  isCollapsed,
  onToggle,
  onRequestDiscardPaths,
  onStagePaths,
  onUnstagePaths
}: {
  node: SourceControlTreeDirectoryNode
  actionPaths: SourceControlDirectoryActionPaths
  hideBulkActions: boolean
  isExecutingBulk: boolean
  isCollapsed: boolean
  onToggle: () => void
  onRequestDiscardPaths: (area: DiscardAllArea, paths: readonly string[]) => void
  onStagePaths: (paths: readonly string[]) => Promise<void>
  onUnstagePaths: (paths: readonly string[]) => Promise<void>
}): React.JSX.Element {
  // Why: filtered tree nodes only contain visible descendants. Folder-wide
  // bulk labels would overpromise if they acted on that filtered subset.
  const canStage = !hideBulkActions && actionPaths.stagePaths.length > 0
  const canUnstage = !hideBulkActions && actionPaths.unstagePaths.length > 0
  const canDiscard = !hideBulkActions && actionPaths.discardPaths.length > 0

  return (
    <DirectoryRow
      node={node}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
      actions={
        canDiscard || canStage || canUnstage ? (
          <>
            {canDiscard && (
              <ActionButton
                surface="row"
                icon={node.area === 'untracked' ? Trash : Undo2}
                title={
                  node.area === 'untracked'
                    ? translate(
                        'auto.components.right.sidebar.SourceControl.9b367363b6',
                        'Delete untracked in folder'
                      )
                    : translate(
                        'auto.components.right.sidebar.SourceControl.6d7f2a47e5',
                        'Discard folder'
                      )
                }
                onClick={(event) => {
                  event.stopPropagation()
                  onRequestDiscardPaths(node.area, actionPaths.discardPaths)
                }}
                disabled={isExecutingBulk}
              />
            )}
            {canStage && (
              <ActionButton
                surface="row"
                icon={Plus}
                title={translate(
                  'auto.components.right.sidebar.SourceControl.bfe9011a0e',
                  'Stage folder'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  void onStagePaths(actionPaths.stagePaths)
                }}
                disabled={isExecutingBulk}
              />
            )}
            {canUnstage && (
              <ActionButton
                surface="row"
                icon={Minus}
                title={translate(
                  'auto.components.right.sidebar.SourceControl.ab31221779',
                  'Unstage folder'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  void onUnstagePaths(actionPaths.unstagePaths)
                }}
                disabled={isExecutingBulk}
              />
            )}
          </>
        ) : undefined
      }
    />
  )
}

export function SourceControlBranchTreeDirectoryRow({
  node,
  isCollapsed,
  onToggle
}: {
  node: BranchSourceControlTreeDirectoryNode
  isCollapsed: boolean
  onToggle: () => void
}): React.JSX.Element {
  return <DirectoryRow node={node} isCollapsed={isCollapsed} onToggle={onToggle} />
}
