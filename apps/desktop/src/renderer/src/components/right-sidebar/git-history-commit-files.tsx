import { ArrowUpRight } from '@phosphor-icons/react'
import type React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { translate } from '@/i18n/i18n'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { basename, dirname } from '@/lib/path'

import type { GitBranchChangeEntry, GitFileStatus } from '../../../../shared/types'
import { formatGitHistoryTimestamp } from './git-history-format'
import {
  toPermanentSourceControlRowOpenEvent,
  toSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from './source-control-split-open'
import { STATUS_COLORS, STATUS_LABELS } from './status-display'

// State for a single commit's lazily-loaded file list. Owned by GitHistoryPanel,
// populated through the onLoadCommitFiles loader supplied by SourceControl.
export type GitHistoryCommitFilesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: GitBranchChangeEntry[] }

function CommitFileRow({
  entry,
  onOpen
}: {
  entry: GitBranchChangeEntry
  onOpen: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const status = entry.status as GitFileStatus
  const FileIcon = getFileTypeIcon(entry.path)
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' ? '' : parentDir

  return (
    <button
      type="button"
      className="group hover:bg-accent/40 focus-visible:bg-accent/40 flex w-full min-w-0 cursor-pointer items-center gap-1 py-1 pr-3 pl-9 text-left text-xs transition-colors outline-none"
      title={entry.path}
      data-testid="git-history-commit-file"
      onClick={(event) => onOpen(entry, toSourceControlRowOpenEvent(event))}
      onDoubleClick={(event) => onOpen(entry, toPermanentSourceControlRowOpenEvent(event))}
    >
      <FileIcon className="size-3.5 shrink-0" style={{ color: STATUS_COLORS[status] }} />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-foreground">{fileName}</span>
        {dirPath && <span className="text-muted-foreground ml-1.5 text-[11px]">{dirPath}</span>}
      </span>
      <span
        className="w-4 shrink-0 text-center text-[10px] font-bold"
        style={{ color: STATUS_COLORS[status] }}
      >
        {STATUS_LABELS[status]}
      </span>
    </button>
  )
}

function CommitFilesBody({
  state,
  onOpenFile,
  onOpenAll
}: {
  state: GitHistoryCommitFilesState
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  onOpenAll?: () => void
}): React.JSX.Element {
  if (state.status === 'loading') {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-1 pr-3 pl-9 text-[11px]">
        <LoadingIndicator className="size-3" />
        <span>
          {translate(
            'auto.components.right.sidebar.GitHistoryCommitFiles.a1b2c3d4e5',
            'Loading files…'
          )}
        </span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="text-destructive py-1 pr-3 pl-9 text-[11px]" title={state.error}>
        {state.error}
      </div>
    )
  }

  if (state.entries.length === 0) {
    return (
      <div className="text-muted-foreground py-1 pr-3 pl-9 text-[11px]">
        {translate(
          'auto.components.right.sidebar.GitHistoryCommitFiles.b2c3d4e5f6',
          'No file changes in this commit'
        )}
      </div>
    )
  }

  return (
    <>
      {state.entries.map((entry) => (
        <CommitFileRow key={entry.path} entry={entry} onOpen={onOpenFile} />
      ))}
      {onOpenAll && (
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:bg-accent/40 focus-visible:text-foreground flex w-full items-center gap-1 py-1 pr-3 pl-9 text-left text-[11px] transition-colors outline-none"
          onClick={onOpenAll}
        >
          <ArrowUpRight className="size-3 shrink-0" />
          <span>
            {translate(
              'auto.components.right.sidebar.GitHistoryCommitFiles.c3d4e5f6a7',
              'Open all changes together'
            )}
          </span>
        </button>
      )}
    </>
  )
}

export function GitHistoryCommitFiles({
  state,
  author,
  timestamp,
  onOpenFile,
  onOpenAll
}: {
  state: GitHistoryCommitFilesState
  author?: string
  timestamp?: number
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  onOpenAll?: () => void
}): React.JSX.Element {
  // Author and date move off the dense commit row and surface here on expand.
  const meta = [author, formatGitHistoryTimestamp(timestamp)].filter(Boolean).join(' · ')
  return (
    <div className="border-border/60 bg-muted/20 border-l">
      {meta && <div className="text-muted-foreground py-1 pr-3 pl-9 text-[11px]">{meta}</div>}
      <CommitFilesBody state={state} onOpenFile={onOpenFile} onOpenAll={onOpenAll} />
    </div>
  )
}
