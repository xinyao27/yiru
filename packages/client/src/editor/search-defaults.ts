import type { EditorSlice } from './store-contract'

const DEFAULT_FILE_SEARCH_STATE = {
  query: '',
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  includePattern: '',
  excludePattern: '',
  results: null,
  loading: false,
  collapsedFiles: new Set<string>()
} satisfies Omit<
  EditorSlice['fileSearchStateByWorktree'][string],
  'seedRequestId' | 'focusRequestId'
>

export function createDefaultFileSearchState(): EditorSlice['fileSearchStateByWorktree'][string] {
  return { ...DEFAULT_FILE_SEARCH_STATE, collapsedFiles: new Set<string>() }
}
