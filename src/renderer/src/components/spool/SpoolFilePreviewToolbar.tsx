import type React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FileDiff,
  MoreHorizontal,
  RefreshCw,
  Save,
  Trash2
} from 'lucide-react'
import type { SpoolFileReadResult } from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SpoolTruncatedPathLabel } from './SpoolTruncatedPathLabel'

export type SpoolFilePreviewMode = 'content' | 'working-diff' | 'staged-diff'

type SpoolFilePreviewToolbarProps = {
  canControl: boolean
  dirty: boolean
  editable: boolean
  file: SpoolFileReadResult
  mode: SpoolFilePreviewMode
  onBack?: () => void
  onDelete: () => void
  onModeChange: (mode: SpoolFilePreviewMode) => void
  onNextChunk: () => void
  onPreviousChunk: () => void
  onRefresh: () => void
  onRename: () => void
  onSave: () => void
  saving: boolean
  supportsDiff: boolean
  surface: 'workspace' | 'sidebar'
}

export function SpoolFilePreviewToolbar(props: SpoolFilePreviewToolbarProps): React.JSX.Element {
  return props.surface === 'sidebar' ? (
    <SidebarFilePreviewToolbar {...props} />
  ) : (
    <WorkspaceFilePreviewToolbar {...props} />
  )
}

function SidebarFilePreviewToolbar({
  canControl,
  dirty,
  editable,
  file,
  mode,
  onBack,
  onDelete,
  onModeChange,
  onNextChunk,
  onPreviousChunk,
  onRefresh,
  onRename,
  onSave,
  saving,
  supportsDiff
}: SpoolFilePreviewToolbarProps): React.JSX.Element {
  const hasPreviousChunk = file.offset > 0
  const hasNextChunk = file.bytesRead > 0 && file.offset + file.bytesRead < file.totalBytes
  const showChunkNavigation = mode === 'content' && (hasPreviousChunk || hasNextChunk)
  return (
    <header className="shrink-0 border-b border-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-9 min-w-0 items-center gap-1 px-1.5">
        {onBack ? (
          <FileToolbarIconButton
            label={translate('auto.components.spool.SpoolFilePreview.back', 'Back to files')}
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" />
          </FileToolbarIconButton>
        ) : null}
        <SpoolTruncatedPathLabel
          path={file.relativePath}
          className="min-w-0 flex-1 px-1 text-foreground"
        />
        <FileToolbarIconButton
          label={translate('auto.components.spool.SpoolFilePreview.reload', 'Reload')}
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" />
        </FileToolbarIconButton>
        {file.encoding === 'utf8' ? (
          <FileToolbarIconButton
            label={
              saving
                ? translate('auto.components.spool.SpoolFilePreview.saving', 'Saving…')
                : translate('auto.components.spool.SpoolFilePreview.save', 'Save')
            }
            disabled={!editable || !dirty || saving}
            onClick={onSave}
          >
            <Save aria-hidden="true" />
          </FileToolbarIconButton>
        ) : null}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={translate(
                    'auto.components.spool.SpoolFilePreview.fileActions',
                    'File actions'
                  )}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.spool.SpoolFilePreview.fileActions', 'File actions')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canControl} onSelect={onRename}>
              {translate('auto.components.spool.SpoolFilePreview.rename', 'Rename')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled={!canControl} onSelect={onDelete}>
              <Trash2 aria-hidden="true" />
              {translate('auto.components.spool.SpoolFilePreview.delete', 'Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {supportsDiff ? (
        <div className="grid h-9 grid-cols-3 items-center gap-1 border-t border-border px-1.5">
          <Button
            type="button"
            size="xs"
            variant={mode === 'content' ? 'secondary' : 'ghost'}
            className="min-w-0 px-1.5"
            onClick={() => onModeChange('content')}
          >
            {translate('auto.components.spool.SpoolFilePreview.content', 'Content')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant={mode === 'working-diff' ? 'secondary' : 'ghost'}
            className="min-w-0 px-1.5"
            onClick={() => onModeChange('working-diff')}
          >
            {translate('auto.components.spool.SpoolFilePreview.workingCompact', 'Working')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant={mode === 'staged-diff' ? 'secondary' : 'ghost'}
            className="min-w-0 px-1.5"
            onClick={() => onModeChange('staged-diff')}
          >
            {translate('auto.components.spool.SpoolFilePreview.stagedCompact', 'Staged')}
          </Button>
        </div>
      ) : null}
      {showChunkNavigation ? (
        <div className="flex h-8 items-center gap-1 border-t border-border px-1.5">
          <FileToolbarIconButton
            label={translate(
              'auto.components.spool.SpoolFilePreview.previousChunk',
              'Previous chunk'
            )}
            disabled={!hasPreviousChunk}
            onClick={onPreviousChunk}
          >
            <ChevronLeft aria-hidden="true" />
          </FileToolbarIconButton>
          <span className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {formatFileByteRange(file)}
          </span>
          <FileToolbarIconButton
            label={translate('auto.components.spool.SpoolFilePreview.nextChunk', 'Next chunk')}
            disabled={!hasNextChunk}
            onClick={onNextChunk}
          >
            <ChevronRight aria-hidden="true" />
          </FileToolbarIconButton>
        </div>
      ) : null}
    </header>
  )
}

function WorkspaceFilePreviewToolbar({
  canControl,
  dirty,
  editable,
  file,
  mode,
  onDelete,
  onModeChange,
  onNextChunk,
  onPreviousChunk,
  onRefresh,
  onRename,
  onSave,
  saving,
  supportsDiff
}: SpoolFilePreviewToolbarProps): React.JSX.Element {
  const showDiff = mode !== 'content'
  const hasPreviousChunk = file.offset > 0
  const hasNextChunk = file.bytesRead > 0 && file.offset + file.bytesRead < file.totalBytes
  return (
    <header className="flex min-h-9 shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card px-2 py-1 text-card-foreground">
      <SpoolTruncatedPathLabel
        path={file.relativePath}
        className="min-w-28 flex-1 px-1 text-foreground"
      />
      {!showDiff && (hasPreviousChunk || hasNextChunk) ? (
        <>
          <span className="shrink-0 px-1 text-[11px] text-muted-foreground">
            {formatFileByteRange(file)}
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={!hasPreviousChunk}
            onClick={onPreviousChunk}
          >
            <ChevronLeft aria-hidden="true" />
            {translate('auto.components.spool.SpoolFilePreview.previousChunk', 'Previous chunk')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={!hasNextChunk}
            onClick={onNextChunk}
          >
            {translate('auto.components.spool.SpoolFilePreview.nextChunk', 'Next chunk')}
            <ChevronRight aria-hidden="true" />
          </Button>
        </>
      ) : null}
      <Button type="button" size="xs" variant="ghost" onClick={onRefresh}>
        <RefreshCw aria-hidden="true" />
        {translate('auto.components.spool.SpoolFilePreview.reload', 'Reload')}
      </Button>
      {supportsDiff ? (
        <>
          <Button
            type="button"
            size="xs"
            variant={mode === 'working-diff' ? 'secondary' : 'ghost'}
            onClick={() => onModeChange('working-diff')}
          >
            <FileDiff aria-hidden="true" />
            {translate('auto.components.spool.SpoolFilePreview.workingDiff', 'Working diff')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant={mode === 'staged-diff' ? 'secondary' : 'ghost'}
            onClick={() => onModeChange('staged-diff')}
          >
            {translate('auto.components.spool.SpoolFilePreview.stagedDiff', 'Staged diff')}
          </Button>
        </>
      ) : null}
      {showDiff ? (
        <Button type="button" size="xs" variant="ghost" onClick={() => onModeChange('content')}>
          {translate('auto.components.spool.SpoolFilePreview.content', 'Content')}
        </Button>
      ) : null}
      <Button type="button" size="xs" variant="ghost" disabled={!canControl} onClick={onRename}>
        {translate('auto.components.spool.SpoolFilePreview.rename', 'Rename')}
      </Button>
      <Button
        type="button"
        size="xs"
        variant="destructive"
        disabled={!canControl}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
        {translate('auto.components.spool.SpoolFilePreview.delete', 'Delete')}
      </Button>
      {!showDiff && file.encoding === 'utf8' ? (
        <Button type="button" size="xs" disabled={!editable || !dirty || saving} onClick={onSave}>
          <Save aria-hidden="true" />
          {saving
            ? translate('auto.components.spool.SpoolFilePreview.saving', 'Saving…')
            : translate('auto.components.spool.SpoolFilePreview.save', 'Save')}
        </Button>
      ) : null}
    </header>
  )
}

function FileToolbarIconButton({
  children,
  label,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function formatFileByteRange(file: SpoolFileReadResult): string {
  const firstByte = file.bytesRead === 0 ? 0 : file.offset + 1
  const lastByte = file.offset + file.bytesRead
  return translate(
    'auto.components.spool.SpoolFilePreview.byteRange',
    '{{value0}}–{{value1}} / {{value2}} bytes',
    {
      value0: firstByte.toLocaleString(),
      value1: lastByte.toLocaleString(),
      value2: file.totalBytes.toLocaleString()
    }
  )
}
