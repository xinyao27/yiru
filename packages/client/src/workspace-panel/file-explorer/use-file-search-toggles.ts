import type React from 'react'

import type { SearchFiltersProps } from '../search-filters'
import type { SearchQueryRowProps } from '../search-query-row'

type SearchStateToggleUpdates = {
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
  includePattern?: string
  excludePattern?: string
}

type UseFileSearchTogglesParams = {
  inputRef: React.Ref<HTMLInputElement>
  includeInputRef: React.RefObject<HTMLInputElement | null>
  excludeInputRef: React.RefObject<HTMLInputElement | null>
  query: string
  loading: boolean
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  includePattern: string
  excludePattern: string
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClearSearch: () => void
  updateActiveSearchState: (updates: SearchStateToggleUpdates) => void
  rerunSearch: () => void
}

// Why: split out of useFileSearchPanel to stay under the .ts line budget —
// this owns the "search option toggles + filters" prop groups, a
// self-contained concern distinct from search execution/results that stay
// in the caller.
export function useFileSearchToggles({
  inputRef,
  includeInputRef,
  excludeInputRef,
  query,
  loading,
  caseSensitive,
  wholeWord,
  useRegex,
  includePattern,
  excludePattern,
  onQueryChange,
  onKeyDown,
  onClearSearch,
  updateActiveSearchState,
  rerunSearch
}: UseFileSearchTogglesParams): {
  queryRowProps: SearchQueryRowProps
  filtersProps: SearchFiltersProps
} {
  // Why: each handler reads the current toggle value so it flips exactly the
  // state visible to the user.
  const handleToggleCaseSensitive = () => {
    updateActiveSearchState({ caseSensitive: !caseSensitive })
    rerunSearch()
  }

  const handleToggleWholeWord = () => {
    updateActiveSearchState({ wholeWord: !wholeWord })
    rerunSearch()
  }

  const handleToggleRegex = () => {
    updateActiveSearchState({ useRegex: !useRegex })
    rerunSearch()
  }

  const handleIncludeChange = (value: string) => {
    updateActiveSearchState({ includePattern: value })
    rerunSearch()
  }

  const handleExcludeChange = (value: string) => {
    updateActiveSearchState({ excludePattern: value })
    rerunSearch()
  }

  const queryRowProps = (() => ({
    inputRef,
    query,
    loading,
    caseSensitive,
    wholeWord,
    useRegex,
    onQueryChange,
    onKeyDown,
    onClearSearch,
    onToggleCaseSensitive: handleToggleCaseSensitive,
    onToggleWholeWord: handleToggleWholeWord,
    onToggleRegex: handleToggleRegex
  }))()

  const filtersProps = (() => ({
    includePattern,
    excludePattern,
    includeInputRef,
    excludeInputRef,
    onIncludeChange: handleIncludeChange,
    onExcludeChange: handleExcludeChange
  }))()

  return (() => ({ queryRowProps, filtersProps }))()
}
