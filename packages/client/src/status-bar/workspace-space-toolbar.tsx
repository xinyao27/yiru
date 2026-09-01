import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Check, MagnifyingGlass as Search, Trash as Trash2 } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import { formatBytes } from './workspace-space-format'
import type { WorkspaceSpaceSortKey } from './workspace-space-presentation'

export function SelectionToolbar({
  selectedCount,
  reclaimableBytes,
  onClear,
  onDelete
}: {
  selectedCount: number
  reclaimableBytes: number
  onClear: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div className="border-border/70 bg-background sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border px-3 py-2">
      <div className="text-muted-foreground min-w-0 text-xs">
        <span className="text-foreground font-medium">
          {selectedCount}{' '}
          {translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.65402b7192',
            'selected'
          )}
        </span>
        <span className="mx-1.5">·</span>
        <span>
          {formatBytes(reclaimableBytes)}{' '}
          {translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.0cb1501ccf',
            'reclaimable'
          )}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={selectedCount === 0}
          className="!px-3"
        >
          {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.e4a12c455b', 'Clear')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={selectedCount === 0}
          className="min-w-[9.5rem] gap-1.5 !px-3.5"
        >
          <Trash2 className="size-3.5" />
          {translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.5caccea440',
            'Delete selected'
          )}
        </Button>
      </div>
    </div>
  )
}

export function FilterToolbar({
  query,
  sortKey,
  onlyDeletable,
  visibleDeletableCount,
  allVisibleSelected,
  onQueryChange,
  onSortKeyChange,
  onToggleOnlyDeletable,
  onToggleVisibleSelection
}: {
  query: string
  sortKey: WorkspaceSpaceSortKey
  onlyDeletable: boolean
  visibleDeletableCount: number
  allVisibleSelected: boolean
  onQueryChange: (query: string) => void
  onSortKeyChange: (key: WorkspaceSpaceSortKey) => void
  onToggleOnlyDeletable: () => void
  onToggleVisibleSelection: () => void
}): React.JSX.Element {
  const changeSort = (value: string | null): void => {
    if (value === 'size' || value === 'name' || value === 'repo' || value === 'activity') {
      onSortKeyChange(value)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[16rem] flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.6f8f6a6b04',
            'Filter workspaces'
          )}
          className="pl-9"
        />
      </div>
      <Select value={sortKey} onValueChange={changeSort}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="size">
            {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.33aef3e9cc', 'Size')}
          </SelectItem>
          <SelectItem value="name">
            {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.243287ac60', 'Name')}
          </SelectItem>
          <SelectItem value="repo">
            {translate(
              'auto.components.status.bar.WorkspaceSpaceManagerPanel.81f14d9924',
              'Repository'
            )}
          </SelectItem>
          <SelectItem value="activity">
            {translate(
              'auto.components.status.bar.WorkspaceSpaceManagerPanel.d7ac56452e',
              'Activity'
            )}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant={onlyDeletable ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggleOnlyDeletable}
        className="w-32"
        aria-label={translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.81aaf1de65',
          'Show only deletable workspaces'
        )}
      >
        {translate(
          onlyDeletable
            ? 'auto.components.status.bar.WorkspaceSpaceManagerPanel.b2f82ed5ae'
            : 'auto.components.status.bar.WorkspaceSpaceManagerPanel.ef890d31b9',
          onlyDeletable ? 'Deletable' : 'All'
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleVisibleSelection}
        disabled={visibleDeletableCount === 0}
        className="w-32 gap-1.5"
        aria-label={translate(
          allVisibleSelected
            ? 'auto.components.status.bar.WorkspaceSpaceManagerPanel.697d60c456'
            : 'auto.components.status.bar.WorkspaceSpaceManagerPanel.1d0f8300d1',
          allVisibleSelected ? 'Clear visible selection' : 'Select visible deletable workspaces'
        )}
      >
        <Check className="size-3.5" />
        {translate(
          allVisibleSelected
            ? 'auto.components.status.bar.WorkspaceSpaceManagerPanel.e4a12c455b'
            : 'auto.components.status.bar.WorkspaceSpaceManagerPanel.f39d291997',
          allVisibleSelected ? 'Clear' : 'Select'
        )}
      </Button>
    </div>
  )
}
