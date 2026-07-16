import type React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw, Save, Trash2 } from 'lucide-react'
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
import { SpoolTooltipIconButton } from './SpoolTooltipIconButton'
import { SpoolTruncatedPathLabel } from './SpoolTruncatedPathLabel'

export type SpoolFilePreviewMode = 'content' | 'working-diff' | 'staged-diff'

type SpoolFilePreviewToolbarProps = {
  canControl: boolean
  dirty: boolean
  editable: boolean
  file: SpoolFileReadResult
  mode: SpoolFilePreviewMode
  onBack: () => void
  onDelete: () => void
  onModeChange: (mode: SpoolFilePreviewMode) => void
  onNextChunk: () => void
  onPreviousChunk: () => void
  onRefresh: () => void
  onRename: () => void
  onSave: () => void
  saving: boolean
  supportsDiff: boolean
}

export function SpoolFilePreviewToolbar({
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
        <SpoolTooltipIconButton
          label={translate('auto.components.spool.SpoolFilePreview.back', 'Back to files')}
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" />
        </SpoolTooltipIconButton>
        <SpoolTruncatedPathLabel
          path={file.relativePath}
          className="min-w-0 flex-1 px-1 text-foreground"
        />
        <SpoolTooltipIconButton
          label={translate('auto.components.spool.SpoolFilePreview.reload', 'Reload')}
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" />
        </SpoolTooltipIconButton>
        {file.encoding === 'utf8' ? (
          <SpoolTooltipIconButton
            label={
              saving
                ? translate('auto.components.spool.SpoolFilePreview.saving', 'Saving…')
                : translate('auto.components.spool.SpoolFilePreview.save', 'Save')
            }
            disabled={!editable || !dirty || saving}
            onClick={onSave}
          >
            <Save aria-hidden="true" />
          </SpoolTooltipIconButton>
        ) : null}
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
                      aria-label={translate(
                        'auto.components.spool.SpoolFilePreview.fileActions',
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
              {translate('auto.components.spool.SpoolFilePreview.fileActions', 'File actions')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canControl} onClick={onRename}>
              {translate('auto.components.spool.SpoolFilePreview.rename', 'Rename')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled={!canControl} onClick={onDelete}>
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
          <SpoolTooltipIconButton
            label={translate(
              'auto.components.spool.SpoolFilePreview.previousChunk',
              'Previous chunk'
            )}
            disabled={!hasPreviousChunk}
            onClick={onPreviousChunk}
          >
            <ChevronLeft aria-hidden="true" />
          </SpoolTooltipIconButton>
          <span className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {formatFileByteRange(file)}
          </span>
          <SpoolTooltipIconButton
            label={translate('auto.components.spool.SpoolFilePreview.nextChunk', 'Next chunk')}
            disabled={!hasNextChunk}
            onClick={onNextChunk}
          >
            <ChevronRight aria-hidden="true" />
          </SpoolTooltipIconButton>
        </div>
      ) : null}
    </header>
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
