import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react'
import React, { useMemo } from 'react'
import { LEGEND_LIST_HORIZONTAL_SCROLL_AREA_PROPS } from '~renderer/components/sidebar/list-scroll-area'
import { translate } from '~renderer/i18n/i18n'

import { detectCsvDelimiter, parseCsv } from './csv-parse'

type CsvViewerProps = {
  content: string
  filePath: string
}

const ROW_HEIGHT = 28
const MIN_COL_PX = 80
const MAX_COL_PX = 320
const ROW_NUMBER_COL_PX = 48
const CHAR_PX = 7

// Why: every body row is exactly ROW_HEIGHT tall, so LegendList's first-paint
// window is already exact and never needs a post-measure correction.
const CSV_ROW_ESTIMATE_PX = ROW_HEIGHT

// Why: the header shares the list's horizontal scrollport, so it must stay in
// flow at the top of the content container rather than scroll away vertically.
const CSV_HEADER_STYLE: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 10 }

// Why: the shared list scroll area defaults every list to overflow-x-hidden;
// a CSV grid is wider than the pane and needs that axis back.
const CSV_LIST_STYLE: React.CSSProperties = { overflowX: 'auto' }

function getCsvRowKey(_row: string[], index: number): string {
  return String(index)
}

// Why: CsvViewer is the table counterpart to source-mode Monaco for .csv/.tsv
// files. Row virtualization via LegendList keeps large files (100k+ rows)
// responsive. We use CSS grid with a shared grid-template-columns rather than a
// <table>, because absolutely-positioned virtualized rows break a table's
// column-width synchronization — the header would size itself independently of
// the body, leaving values squashed together.
export default function CsvViewer({ content, filePath }: CsvViewerProps): React.JSX.Element {
  const parsed = useMemo(() => {
    const delimiter = detectCsvDelimiter(filePath, content)
    return parseCsv(content, delimiter)
  }, [content, filePath])

  // Why: memoize header/body split so their references stay stable across
  // renders that don't change content. A top-level rest-destructure would
  // slice the full rows array (100k+ on large files) on every render and
  // produce a new `bodyRows` reference, invalidating the downstream
  // `columnWidths`/`gridTemplate` memos below.
  const { headerRow, bodyRows } = useMemo(() => {
    if (parsed.rows.length === 0) {
      return { headerRow: [] as string[], bodyRows: [] as string[][] }
    }
    const [head, ...rest] = parsed.rows
    return { headerRow: head ?? [], bodyRows: rest }
  }, [parsed])
  const columnCount = parsed.maxColumns
  const header = useMemo(() => {
    const out = [...(headerRow ?? [])]
    while (out.length < columnCount) {
      out.push('')
    }
    return out
  }, [headerRow, columnCount])

  // Why: size each column to its widest-seen value (sampled) so headers and
  // body cells stay aligned. We cap sampling to the first 200 rows to avoid
  // scanning huge files; uncommon long values clip with ellipsis rather than
  // blowing out the viewport width.
  const columnWidths = useMemo(() => {
    const widths = Array.from<number>({ length: columnCount }).fill(MIN_COL_PX)
    const consider = (cell: string | undefined, idx: number): void => {
      if (!cell) {
        return
      }
      const w = Math.min(MAX_COL_PX, Math.max(MIN_COL_PX, cell.length * CHAR_PX + 24))
      if (w > widths[idx]!) {
        widths[idx] = w
      }
    }
    header.forEach(consider)
    const sampleLimit = Math.min(bodyRows.length, 200)
    for (let i = 0; i < sampleLimit; i += 1) {
      const row = bodyRows[i]!
      for (let c = 0; c < columnCount; c += 1) {
        consider(row[c], c)
      }
    }
    return widths
  }, [header, bodyRows, columnCount])

  const gridTemplate = useMemo(
    () => `${ROW_NUMBER_COL_PX}px ${columnWidths.map((w) => `${w}px`).join(' ')}`,
    [columnWidths]
  )

  // Why: LegendList positions rows absolutely against this container, so it has
  // to be as wide as the grid — otherwise the rows are clipped at the viewport
  // edge and the horizontal scrollport never extends past the visible columns.
  const contentContainerStyle = useMemo<React.CSSProperties>(
    () => ({
      minWidth: '100%',
      position: 'relative',
      width: columnWidths.reduce((total, w) => total + w, ROW_NUMBER_COL_PX)
    }),
    [columnWidths]
  )

  const headerElement = useMemo(
    () => (
      <div
        role="row"
        aria-rowindex={1}
        className="bg-muted grid"
        style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT }}
      >
        <div
          role="columnheader"
          className="border-border/60 bg-muted/90 text-muted-foreground sticky left-0 z-20 flex items-center justify-end border-r border-b px-2 text-[10px] font-normal"
        >
          #
        </div>
        {header.map((cell, idx) => (
          <div
            role="columnheader"
            key={idx}
            className="border-border/60 text-foreground flex items-center overflow-hidden border-r border-b px-2 font-medium"
          >
            <span className="truncate" title={cell}>
              {cell}
            </span>
          </div>
        ))}
      </div>
    ),
    [gridTemplate, header]
  )

  if (parsed.rows.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {translate('auto.components.editor.CsvViewer.a233d55b77', 'Empty file')}
      </div>
    )
  }

  const renderRow = ({ item, index }: LegendListRenderItemProps<string[]>): React.ReactNode => (
    <div
      role="row"
      aria-rowindex={index + 2}
      data-index={index}
      className="group hover:bg-accent/40 grid"
      style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT }}
    >
      <div
        role="rowheader"
        className="border-border/40 bg-background text-muted-foreground group-hover:bg-accent/40 sticky left-0 z-[5] flex items-center justify-end border-r border-b px-2 text-[10px]"
      >
        {index + 1}
      </div>
      {Array.from({ length: columnCount }).map((_, colIdx) => (
        <div
          role="cell"
          key={colIdx}
          className="border-border/40 text-foreground flex items-center overflow-hidden border-r border-b px-2"
          title={item[colIdx] ?? ''}
        >
          <span className="truncate">{item[colIdx] ?? ''}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="table"
        aria-rowcount={parsed.rows.length}
        aria-colcount={columnCount + 1}
        className="min-h-0 flex-1 font-mono text-xs"
      >
        <LegendList<string[]>
          {...LEGEND_LIST_HORIZONTAL_SCROLL_AREA_PROPS}
          className="scrollbar-editor"
          contentContainerStyle={contentContainerStyle}
          data={bodyRows}
          keyExtractor={getCsvRowKey}
          estimatedItemSize={CSV_ROW_ESTIMATE_PX}
          ListHeaderComponent={headerElement}
          ListHeaderComponentStyle={CSV_HEADER_STYLE}
          renderItem={renderRow}
          style={CSV_LIST_STYLE}
        />
      </div>
      <div className="border-border/60 text-muted-foreground flex items-center gap-4 border-t px-3 py-1 text-xs">
        <span>
          {bodyRows.length.toLocaleString()}{' '}
          {translate('auto.components.editor.CsvViewer.ac31d2cd60', 'rows')}
        </span>
        <span>
          {columnCount} {translate('auto.components.editor.CsvViewer.eedd0d37a7', 'columns')}
        </span>
      </div>
    </div>
  )
}
