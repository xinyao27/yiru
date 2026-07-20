import { Minus } from '@phosphor-icons/react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Plus, X } from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function BulkActionBar({
  selectedCount,
  stageableCount,
  unstageableCount,
  onStage,
  onUnstage,
  onClear,
  isExecuting
}: {
  selectedCount: number
  stageableCount: number
  unstageableCount: number
  onStage: () => void
  onUnstage: () => void
  onClear: () => void
  isExecuting: boolean
}) {
  return (
    <div className="bg-background border-border animate-in slide-in-from-bottom-2 absolute right-0 bottom-0 left-0 z-10 border-t p-2 shadow-lg">
      <div className="bg-accent/30 border-border/50 flex items-center justify-between gap-2 rounded-md border p-1.5 pr-2">
        <div className="text-foreground ml-1 flex items-center gap-2 text-xs font-medium">
          {isExecuting ? (
            <LoadingIndicator className="text-muted-foreground size-3.5" />
          ) : (
            <span className="tabular-nums">
              {selectedCount}{' '}
              {translate('auto.components.right.sidebar.BulkActionBar.60ed678138', 'selected')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {stageableCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onStage}
              disabled={isExecuting}
            >
              <Plus className="mr-1 size-3" />
              {translate('auto.components.right.sidebar.BulkActionBar.ef5f5bd06e', 'Stage (')}
              {stageableCount})
            </Button>
          )}
          {unstageableCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onUnstage}
              disabled={isExecuting}
            >
              <Minus className="mr-1 size-3" />
              {translate('auto.components.right.sidebar.BulkActionBar.79a9f5f712', 'Unstage (')}
              {unstageableCount})
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-muted ml-0.5 h-7 w-7"
            onClick={onClear}
            disabled={isExecuting}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
