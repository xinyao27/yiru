import {
  DotsThree as MoreHorizontal,
  FloppyDisk as Save,
  Trash as Trash2,
  ArrowClockwise as RefreshCw,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight
} from '@phosphor-icons/react'
import type React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { CoworkingFileReadResult } from '../../../../shared/coworking/operation-contract'
import { CoworkingTooltipIconButton } from './tooltip-icon-button'
import { CoworkingTruncatedPathLabel } from './truncated-path-label'

export type CoworkingFilePreviewMode = 'content' | 'working-diff' | 'staged-diff'

type CoworkingFilePreviewToolbarProps = {
  canControl: boolean
  dirty: boolean
  editable: boolean
  file: CoworkingFileReadResult
  mode: CoworkingFilePreviewMode
  onBack: () => void
  onDelete: () => void
  onModeChange: (mode: CoworkingFilePreviewMode) => void
  onNextChunk: () => void
  onPreviousChunk: () => void
  onRefresh: () => void
  onRename: () => void
  onSave: () => void
  saving: boolean
  supportsDiff: boolean
}

export function CoworkingFilePreviewToolbar({
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
}: CoworkingFilePreviewToolbarProps): React.JSX.Element {
  const hasPreviousChunk = file.offset > 0
  const hasNextChunk = file.bytesRead > 0 && file.offset + file.bytesRead < file.totalBytes
  const showChunkNavigation = mode === 'content' && (hasPreviousChunk || hasNextChunk)
  return (
    <header className="border-border bg-sidebar text-sidebar-foreground shrink-0 border-b">
      <div className="flex h-9 min-w-0 items-center gap-1 px-1.5">
        <CoworkingTooltipIconButton
          label={translate('auto.components.coworking.CoworkingFilePreview.back', 'Back to files')}
          variant="ghost"
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" />
        </CoworkingTooltipIconButton>
        <CoworkingTruncatedPathLabel
          path={file.relativePath}
          className="text-foreground min-w-0 flex-1 px-1"
        />
        <CoworkingTooltipIconButton
          label={translate('auto.components.coworking.CoworkingFilePreview.reload', 'Reload')}
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" />
        </CoworkingTooltipIconButton>
        {file.encoding === 'utf8' ? (
          <CoworkingTooltipIconButton
            label={
              saving
                ? translate('auto.components.coworking.CoworkingFilePreview.saving', 'Saving…')
                : translate('auto.components.coworking.CoworkingFilePreview.save', 'Save')
            }
            disabled={!editable || !dirty || saving}
            onClick={onSave}
          >
            <Save aria-hidden="true" />
          </CoworkingTooltipIconButton>
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
                      variant="outline"
                      aria-label={translate(
                        'auto.components.coworking.CoworkingFilePreview.fileActions',
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
              {translate(
                'auto.components.coworking.CoworkingFilePreview.fileActions',
                'File actions'
              )}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canControl} onClick={onRename}>
              {translate('auto.components.coworking.CoworkingFilePreview.rename', 'Rename')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled={!canControl} onClick={onDelete}>
              <Trash2 aria-hidden="true" />
              {translate('auto.components.coworking.CoworkingFilePreview.delete', 'Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {supportsDiff ? (
        <div className="border-border grid h-9 grid-cols-3 items-center gap-1 border-t px-1.5">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={cn(
              'min-w-0 px-1.5',
              mode === 'content' && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onModeChange('content')}
          >
            {translate('auto.components.coworking.CoworkingFilePreview.content', 'Content')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={cn(
              'min-w-0 px-1.5',
              mode === 'working-diff' && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onModeChange('working-diff')}
          >
            {translate('auto.components.coworking.CoworkingFilePreview.workingCompact', 'Working')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={cn(
              'min-w-0 px-1.5',
              mode === 'staged-diff' && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onModeChange('staged-diff')}
          >
            {translate('auto.components.coworking.CoworkingFilePreview.stagedCompact', 'Staged')}
          </Button>
        </div>
      ) : null}
      {showChunkNavigation ? (
        <div className="border-border flex h-8 items-center gap-1 border-t px-1.5">
          <CoworkingTooltipIconButton
            label={translate(
              'auto.components.coworking.CoworkingFilePreview.previousChunk',
              'Previous chunk'
            )}
            disabled={!hasPreviousChunk}
            onClick={onPreviousChunk}
          >
            <ChevronLeft aria-hidden="true" />
          </CoworkingTooltipIconButton>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-center text-[11px]">
            {formatFileByteRange(file)}
          </span>
          <CoworkingTooltipIconButton
            label={translate(
              'auto.components.coworking.CoworkingFilePreview.nextChunk',
              'Next chunk'
            )}
            disabled={!hasNextChunk}
            onClick={onNextChunk}
          >
            <ChevronRight aria-hidden="true" />
          </CoworkingTooltipIconButton>
        </div>
      ) : null}
    </header>
  )
}

function formatFileByteRange(file: CoworkingFileReadResult): string {
  const firstByte = file.bytesRead === 0 ? 0 : file.offset + 1
  const lastByte = file.offset + file.bytesRead
  return translate(
    'auto.components.coworking.CoworkingFilePreview.byteRange',
    '{{value0}}–{{value1}} / {{value2}} bytes',
    {
      value0: firstByte.toLocaleString(),
      value1: lastByte.toLocaleString(),
      value2: file.totalBytes.toLocaleString()
    }
  )
}
