import React from 'react'

import { translate } from '@/i18n/i18n'

export type SearchFiltersProps = {
  includePattern: string
  excludePattern: string
  onIncludeChange: (value: string) => void
  onExcludeChange: (value: string) => void
  includeInputRef?: React.RefObject<HTMLInputElement | null>
  excludeInputRef?: React.RefObject<HTMLInputElement | null>
}

export function SearchFilters({
  includePattern,
  excludePattern,
  onIncludeChange,
  onExcludeChange,
  includeInputRef,
  excludeInputRef
}: SearchFiltersProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {translate('auto.components.right.sidebar.SearchFilters.a69ee1bd0e', 'Files To Include')}
        </span>
        <input
          ref={includeInputRef}
          type="text"
          className="bg-input/50 border-border focus:border-ring text-foreground placeholder:text-muted-foreground/50 rounded-sm border px-2 py-1 text-xs outline-none"
          placeholder={translate(
            'auto.components.right.sidebar.SearchFilters.8a77efcbd1',
            'files to include (e.g. *.ts, src/**)'
          )}
          value={includePattern}
          onChange={(e) => onIncludeChange(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {translate('auto.components.right.sidebar.SearchFilters.0a6412a895', 'Files To Exclude')}
        </span>
        <input
          ref={excludeInputRef}
          type="text"
          className="bg-input/50 border-border focus:border-ring text-foreground placeholder:text-muted-foreground/50 rounded-sm border px-2 py-1 text-xs outline-none"
          placeholder={translate(
            'auto.components.right.sidebar.SearchFilters.01e4671ccf',
            'files to exclude (e.g. *.min.js, dist/**)'
          )}
          value={excludePattern}
          onChange={(e) => onExcludeChange(e.target.value)}
          spellCheck={false}
        />
      </label>
    </div>
  )
}
