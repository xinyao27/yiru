import { useVirtualizer } from '@tanstack/react-virtual'
import React from 'react'

import { translate } from '@/i18n/i18n'

import type { SearchFileResult, SearchMatch, SearchResult } from '../../../../shared/types'
import { FileResultRow, MatchResultRow } from './search-result-items'
import type { SearchRow } from './search-rows'

const SEARCH_VIRTUAL_OVERSCAN = 12

type SearchResultsPaneProps = {
  results: SearchResult | null
  hasCommittedResults: boolean
  query: string
  loading: boolean
  rows: SearchRow[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  onToggleCollapsedFile: (filePath: string) => void
  onMatchClick: (fileResult: SearchFileResult, match: SearchMatch) => void
}

export function SearchResultsPane({
  results,
  hasCommittedResults,
  query,
  loading,
  rows,
  scrollRef,
  onToggleCollapsedFile,
  onMatchClick
}: SearchResultsPaneProps): React.JSX.Element {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (!row) {
        return 20
      }
      // Why: file rows include pt-1.5 (6 px) for inter-group spacing, so
      // their estimate is taller than match rows.
      if (row.type === 'file') {
        return 28
      }
      return 20
    },
    // Why: paddingEnd adds visible breathing room after the last result row.
    // paddingStart is unnecessary because each file row already includes
    // pt-1.5 for inter-group spacing (which also covers the first row).
    paddingEnd: 8,
    overscan: SEARCH_VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const row = rows[index]
      if (!row) {
        return `missing:${index}`
      }
      if (row.type === 'file') {
        return `file:${row.fileResult.filePath}`
      }
      return `match:${row.fileResult.filePath}:${row.match.line}:${row.match.column}:${row.matchIndex}`
    }
  })

  return (
    <>
      {/* Why: the summary is rendered outside the virtualizer so it stays
         pinned at the top while the user scrolls through results. */}
      {results && rows.length > 0 && (
        <div className="text-muted-foreground border-border border-b px-2 py-1 text-[10px]">
          {results.totalMatches}{' '}
          {translate('auto.components.right.sidebar.Search.6aeda362ed', 'result')}
          {results.totalMatches !== 1 ? 's' : ''}{' '}
          {translate('auto.components.right.sidebar.Search.4107975b3a', 'in')}{' '}
          {results.files.length}{' '}
          {translate('auto.components.right.sidebar.Search.0b8104eaf2', 'file')}
          {results.files.length !== 1 ? 's' : ''}
          {results.truncated &&
            translate('auto.components.right.sidebar.Search.dcc294f28d', '(results truncated)')}
        </div>
      )}

      <div ref={scrollRef} className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {rows.length > 0 && (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) {
                return null
              }

              return (
                <div
                  key={virtualRow.key}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.type === 'file' && (
                    <FileResultRow
                      fileResult={row.fileResult}
                      collapsed={row.collapsed}
                      onToggleCollapse={() => onToggleCollapsedFile(row.fileResult.filePath)}
                    />
                  )}
                  {row.type === 'match' && (
                    <MatchResultRow
                      match={row.match}
                      relativePath={row.fileResult.relativePath}
                      onClick={() => onMatchClick(row.fileResult, row.match)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!hasCommittedResults && query && !loading && (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
            {translate('auto.components.right.sidebar.Search.d56d140747', 'Press Enter to search')}
          </div>
        )}

        {!query && (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
            {translate(
              'auto.components.right.sidebar.Search.1abfb25a66',
              'Type to search in files'
            )}
          </div>
        )}
      </div>
    </>
  )
}
