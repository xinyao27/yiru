import {
  MagnifyingGlass as SearchIcon,
  TextAa as CaseSensitive,
  BracketsSquare as WholeWord,
  Asterisk as Regex,
  X
} from '@phosphor-icons/react'
import React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'
import { ToggleButton } from './search-result-items'

export type SearchQueryRowProps = {
  inputRef: React.Ref<HTMLInputElement>
  query: string
  loading: boolean
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClearSearch: () => void
  onToggleCaseSensitive: () => void
  onToggleWholeWord: () => void
  onToggleRegex: () => void
}

export function SearchQueryRow({
  inputRef,
  query,
  loading,
  caseSensitive,
  wholeWord,
  useRegex,
  onQueryChange,
  onKeyDown,
  onClearSearch,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onToggleRegex
}: SearchQueryRowProps): React.JSX.Element {
  return (
    <div
      className="border-border bg-input/50 focus-within:border-ring flex h-7 items-center gap-1 rounded-sm border px-1.5"
      data-ignore-file-explorer-keys="true"
    >
      <SearchIcon className="text-muted-foreground size-3.5 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        className="text-foreground placeholder:text-muted-foreground/50 min-w-0 flex-1 bg-transparent py-1 text-xs outline-none"
        aria-label={translate(
          'auto.components.right.sidebar.SearchQueryRow.queryLabel',
          'Search files'
        )}
        placeholder={translate('auto.components.right.sidebar.SearchHeader.693cbeadd0', 'Search')}
        value={query}
        onChange={onQueryChange}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      {loading ? <LoadingIndicator className="text-muted-foreground size-3 shrink-0" /> : null}
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME,
            'h-auto w-auto rounded-sm p-0.5'
          )}
          aria-label={translate(
            'auto.components.right.sidebar.SearchQueryRow.clearLabel',
            'Clear search'
          )}
          onClick={onClearSearch}
        >
          <X className="size-3" />
        </Button>
      ) : null}
      <ToggleButton
        active={caseSensitive}
        onClick={onToggleCaseSensitive}
        title={translate('auto.components.right.sidebar.SearchHeader.464ae3974f', 'Match Case')}
      >
        <CaseSensitive className="size-3.5" />
      </ToggleButton>
      <ToggleButton
        active={wholeWord}
        onClick={onToggleWholeWord}
        title={translate(
          'auto.components.right.sidebar.SearchHeader.4567e6e0b6',
          'Match Whole Word'
        )}
      >
        <WholeWord className="size-3.5" />
      </ToggleButton>
      <ToggleButton
        active={useRegex}
        onClick={onToggleRegex}
        title={translate(
          'auto.components.right.sidebar.SearchHeader.6234a5ef85',
          'Use Regular Expression'
        )}
      >
        <Regex className="size-3.5" />
      </ToggleButton>
    </div>
  )
}
