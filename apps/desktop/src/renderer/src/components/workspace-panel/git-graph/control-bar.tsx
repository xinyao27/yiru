import { ArrowClockwise, MagnifyingGlass, X } from '@phosphor-icons/react'
import type React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

import type { GitGraphBranchOption } from './branch-filter'
import { GitGraphBranchFilterDropdown } from './branch-filter-dropdown'

export function GitGraphControlBar({
  branchOptions,
  selectedRefIds,
  onSelectedRefIdsChange,
  includeRemoteBranches,
  onIncludeRemoteBranchesChange,
  onRefresh,
  isRefreshing,
  onToggleFind,
  onClose
}: {
  branchOptions: readonly GitGraphBranchOption[]
  selectedRefIds: readonly string[] | null
  onSelectedRefIdsChange: (refIds: string[] | null) => void
  includeRemoteBranches: boolean
  onIncludeRemoteBranchesChange: (include: boolean) => void
  onRefresh: () => void
  isRefreshing: boolean
  onToggleFind: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-2">
      <GitGraphBranchFilterDropdown
        options={branchOptions}
        selectedRefIds={selectedRefIds}
        onChange={onSelectedRefIdsChange}
      />
      <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-[11px]">
        <Switch checked={includeRemoteBranches} onCheckedChange={onIncludeRemoteBranchesChange} />
        {translate(
          'auto.components.workspace-panel.git-graph.ControlBar.a1b2c3d4e5',
          'Show Remote Branches'
        )}
      </label>
      <span className="min-w-0 flex-1" aria-hidden="true" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onToggleFind}
              aria-label={translate(
                'auto.components.workspace-panel.git-graph.ControlBar.b2c3d4e5f6',
                'Find commits'
              )}
            >
              <MagnifyingGlass className="size-3.5" />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {translate(
            'auto.components.workspace-panel.git-graph.ControlBar.b2c3d4e5f6',
            'Find commits'
          )}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label={translate(
                'auto.components.workspace-panel.git-graph.ControlBar.c3d4e5f6a7',
                'Refresh'
              )}
            >
              {isRefreshing ? (
                <LoadingIndicator className="size-3.5" />
              ) : (
                <ArrowClockwise className="size-3.5" />
              )}
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.workspace-panel.git-graph.ControlBar.c3d4e5f6a7', 'Refresh')}
        </TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        aria-label={translate(
          'auto.components.workspace-panel.git-graph.ControlBar.d4e5f6a7b8',
          'Close Git Graph'
        )}
        title={translate(
          'auto.components.workspace-panel.git-graph.ControlBar.d4e5f6a7b8',
          'Close Git Graph'
        )}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
