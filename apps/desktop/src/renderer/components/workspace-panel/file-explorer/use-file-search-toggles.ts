import type React from 'react'
import { useCallback, useMemo } from 'react'

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
  // Why: these three read the current toggle value to flip it, so that value
  // must stay in the dependency array — dropping it would re-run the last
  // render's toggle (stale closure) instead of the one the user just saw.
  const handleToggleCaseSensitive = useCallback(() => {
    updateActiveSearchState({ caseSensitive: !caseSensitive })
    rerunSearch()
  }, [updateActiveSearchState, caseSensitive, rerunSearch])

  const handleToggleWholeWord = useCallback(() => {
    updateActiveSearchState({ wholeWord: !wholeWord })
    rerunSearch()
  }, [updateActiveSearchState, wholeWord, rerunSearch])

  const handleToggleRegex = useCallback(() => {
    updateActiveSearchState({ useRegex: !useRegex })
    rerunSearch()
  }, [updateActiveSearchState, useRegex, rerunSearch])

  const handleIncludeChange = useCallback(
    (value: string) => {
      updateActiveSearchState({ includePattern: value })
      rerunSearch()
    },
    [updateActiveSearchState, rerunSearch]
  )

  const handleExcludeChange = useCallback(
    (value: string) => {
      updateActiveSearchState({ excludePattern: value })
      rerunSearch()
    },
    [updateActiveSearchState, rerunSearch]
  )

  const queryRowProps = useMemo<SearchQueryRowProps>(
    () => ({
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
    }),
    [
      query,
      loading,
      caseSensitive,
      wholeWord,
      useRegex,
      onQueryChange,
      onKeyDown,
      onClearSearch,
      handleToggleCaseSensitive,
      handleToggleWholeWord,
      handleToggleRegex,
      inputRef
    ]
  )

  const filtersProps = useMemo<SearchFiltersProps>(
    () => ({
      includePattern,
      excludePattern,
      includeInputRef,
      excludeInputRef,
      onIncludeChange: handleIncludeChange,
      onExcludeChange: handleExcludeChange
    }),
    [
      includePattern,
      excludePattern,
      handleIncludeChange,
      handleExcludeChange,
      includeInputRef,
      excludeInputRef
    ]
  )

  return useMemo(() => ({ queryRowProps, filtersProps }), [queryRowProps, filtersProps])
}
