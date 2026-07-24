import { Funnel as ListFilter, X } from '@phosphor-icons/react'
import React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

type FileExplorerNameFilterProps = {
  query: string
  loading?: boolean
  onQueryChange: (value: string) => void
  onClear: () => void
}

export function FileExplorerNameFilter({
  query,
  loading = false,
  onQueryChange,
  onClear
}: FileExplorerNameFilterProps): React.JSX.Element {
  return (
    <div
      className="border-border bg-input/50 focus-within:border-ring flex h-7 items-center gap-1 border px-1.5"
      data-ignore-file-explorer-keys="true"
    >
      <ListFilter className="text-muted-foreground size-3.5 shrink-0" />
      <Input
        type="text"
        variant="chrome-free"
        size="xs"
        className="flex-1"
        aria-label={translate(
          'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
          'Find files'
        )}
        placeholder={translate(
          'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
          'Find files'
        )}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        spellCheck={false}
      />
      {loading ? <LoadingIndicator className="text-muted-foreground size-3 shrink-0" /> : null}
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME, 'h-auto w-auto p-0.5')}
          aria-label={translate(
            'auto.components.right.sidebar.FileExplorerNameFilter.4d5a6b2a49',
            'Clear file filter'
          )}
          onClick={onClear}
        >
          <X weight="regular" className="size-3" />
        </Button>
      ) : null}
    </div>
  )
}
