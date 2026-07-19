import React from 'react'
import {
  List,
  TreeStructure as ListTree,
  Chat as MessageSquare,
  DotsThree as MoreHorizontal,
  ArrowClockwise as RefreshCw,
  GearSix as Settings2
} from '@phosphor-icons/react'
import type { SourceControlViewMode } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

export function SourceControlHeaderOverflowMenu({
  sourceControlViewMode,
  viewModeToggleDisabled,
  onToggleViewMode,
  onChangeBaseRef,
  onRefreshBranchCompare,
  branchCompareRefreshDisabled,
  diffCommentCount,
  onExpandNotes
}: {
  sourceControlViewMode: SourceControlViewMode
  viewModeToggleDisabled: boolean
  onToggleViewMode: () => void
  onChangeBaseRef: () => void
  onRefreshBranchCompare: () => void
  branchCompareRefreshDisabled: boolean
  diffCommentCount: number
  onExpandNotes: () => void
}): React.JSX.Element {
  const viewModeLabel =
    sourceControlViewMode === 'tree'
      ? translate('auto.components.right.sidebar.SourceControl.a91f8e2b01', 'View as list')
      : translate('auto.components.right.sidebar.SourceControl.b82e9f3c12', 'View as tree')

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex shrink-0">
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    className={`${RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME} size-7`}
                    aria-label={translate(
                      'auto.components.right.sidebar.SourceControl.f71c4a8d90',
                      'More source control actions'
                    )}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                }
              />
            </span>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {translate(
            'auto.components.right.sidebar.SourceControl.f71c4a8d90',
            'More source control actions'
          )}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuItem disabled={viewModeToggleDisabled} onClick={onToggleViewMode}>
          {sourceControlViewMode === 'tree' ? (
            <List className="size-3.5" />
          ) : (
            <ListTree className="size-3.5" />
          )}
          {viewModeLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onChangeBaseRef}>
          <Settings2 className="size-3.5" />
          {translate('auto.components.right.sidebar.SourceControl.476b77745b', 'Change Base Ref')}…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={branchCompareRefreshDisabled} onClick={onRefreshBranchCompare}>
          <RefreshCw className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.SourceControl.ed34038d0d',
            'Refresh branch compare'
          )}
        </DropdownMenuItem>
        {diffCommentCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExpandNotes}>
              <MessageSquare className="size-3.5" />
              {translate('auto.components.right.sidebar.SourceControl.cc474e0b8c', 'Notes')}
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {diffCommentCount}
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
