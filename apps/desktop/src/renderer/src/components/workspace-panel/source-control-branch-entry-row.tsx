import { Chat as MessageSquare } from '@phosphor-icons/react'
import React from 'react'

import { translate } from '@/i18n/i18n'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { basename, dirname, joinPath } from '@/lib/path'
import { WORKSPACE_FILE_PATH_MIME } from '@/lib/workspace-file-drag'

import type { GitBranchChangeEntry } from '../../../../shared/types'
import { SourceControlEntryContextMenu } from './source-control-entry-context-menu'
import { DiffLineCounts } from './source-control-entry-details'
import {
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX
} from './source-control-panel-constants'
import {
  toPermanentSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from './source-control-split-open'
import { STATUS_COLORS, STATUS_LABELS } from './status-display'

export function BranchEntryRow({
  entry,
  currentWorktreeId,
  worktreePath,
  depth = 0,
  onRevealInExplorer,
  connectionId,
  onOpen,
  commentCount,
  showPathHint = true
}: {
  entry: GitBranchChangeEntry
  currentWorktreeId: string
  worktreePath: string
  depth?: number
  onRevealInExplorer: (worktreeId: string, absolutePath: string) => void
  connectionId?: string | null
  onOpen: (event?: SourceControlRowOpenEvent) => void
  commentCount: number
  showPathHint?: boolean
}): React.JSX.Element {
  const FileIcon = getFileTypeIcon(entry.path)
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' ? '' : parentDir

  return (
    <SourceControlEntryContextMenu
      currentWorktreeId={currentWorktreeId}
      absolutePath={joinPath(worktreePath, entry.path)}
      connectionId={connectionId}
      onView={() => onOpen()}
      onRevealInExplorer={onRevealInExplorer}
    >
      <div
        className="group hover:bg-accent/40 flex cursor-pointer items-center gap-1 py-1 pr-3 transition-colors"
        style={{
          paddingLeft: `${depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_FILE_PADDING_PX}px`
        }}
        draggable
        onDragStart={(e) => {
          const absolutePath = joinPath(worktreePath, entry.path)
          e.dataTransfer.setData(WORKSPACE_FILE_PATH_MIME, absolutePath)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={(e) => onOpen(e)}
        onDoubleClick={(e) => onOpen(toPermanentSourceControlRowOpenEvent(e))}
      >
        <FileIcon className="size-3.5 shrink-0" style={{ color: STATUS_COLORS[entry.status] }} />
        <span className="min-w-0 flex-1 truncate text-xs">
          <span className="text-foreground">{fileName}</span>
          {showPathHint && dirPath && (
            <span className="text-muted-foreground ml-1.5 text-[11px]">{dirPath}</span>
          )}
        </span>
        {commentCount > 0 && (
          <span
            className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-[10px]"
            title={translate(
              'auto.components.right.sidebar.SourceControl.657e0c90ad',
              '{{value0}} note{{value1}}',
              { value0: commentCount, value1: commentCount === 1 ? '' : 's' }
            )}
          >
            <MessageSquare className="size-3" />
            <span className="tabular-nums">{commentCount}</span>
          </span>
        )}
        <DiffLineCounts added={entry.added} removed={entry.removed} />
        <span
          className="w-4 shrink-0 text-center text-[10px] font-bold"
          style={{ color: STATUS_COLORS[entry.status] }}
        >
          {STATUS_LABELS[entry.status]}
        </span>
      </div>
    </SourceControlEntryContextMenu>
  )
}
