import React, { useRef } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { computeEditorFontSize } from '~renderer/editor/font-zoom'
import { useAppStore } from '~renderer/store/state'
import { Textarea } from '~renderer/ui/textarea'

import CodeExcerpt from './code-excerpt'
import FileCodeView from './file-code-view'
import { getIpynbCodeCellEditorHeight, getIpynbCodeCellPreviewLines } from './ipynb-code-cell-lines'
import type { IpynbCell } from './ipynb-types'

export function MarkdownCell({ source }: { source: string }): React.JSX.Element {
  return (
    <div className="markdown-preview-body px-4 py-3 text-sm">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
        {source || '\u00a0'}
      </Markdown>
    </div>
  )
}

function CodeCell({
  cell,
  source,
  active,
  onActivate,
  onDeactivate,
  onChange,
  onSaveRequest
}: {
  cell: IpynbCell
  source: string
  active: boolean
  onActivate: () => void
  onDeactivate: () => void
  onChange: (source: string) => void
  onSaveRequest: () => Promise<void>
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const onDeactivateRef = useRef(onDeactivate)
  const onSaveRequestRef = useRef(onSaveRequest)
  // Why: listeners are installed once on mount and need the latest callbacks
  // without rebuilding the embedded editor.
  onDeactivateRef.current = onDeactivate
  onSaveRequestRef.current = onSaveRequest
  const fontSize = computeEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel)
  const editorHeight = getIpynbCodeCellEditorHeight(source, fontSize)
  const lines = (() => getIpynbCodeCellPreviewLines(source))()
  // Why: cells carry an optional notebook id; fall back to the language so the
  // surface still gets a stable key for its editor state.
  const cellEditorId = `ipynb-cell:${cell.id ?? cell.language}`

  if (!active) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="bg-background focus-visible:bg-accent block w-full cursor-text text-left outline-none"
        onClick={onActivate}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onActivate()
          }
        }}
      >
        <CodeExcerpt
          lines={lines}
          firstLineNumber={1}
          highlightedStartLine={-1}
          highlightedEndLine={-1}
        />
      </div>
    )
  }

  return (
    <div className="bg-background">
      {/* Why: the cell owns deactivation, and Pierre's editor ships no command
          layer, so Escape and focus-out are handled on the host element. */}
      <div
        style={{ height: editorHeight }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onDeactivateRef.current()
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            onDeactivateRef.current()
          }
        }}
      >
        <FileCodeView
          fileId={cellEditorId}
          filePath={cellEditorId}
          viewStateKey={cellEditorId}
          relativePath={cellEditorId}
          content={source}
          language={cell.language}
          onContentChange={onChange}
          onSave={() => {
            void onSaveRequestRef.current()
          }}
        />
      </div>
    </div>
  )
}

export const MemoizedCodeCell = CodeCell

export function getCellKey(cell: IpynbCell, index: number): string {
  return cell.id ?? `${index}:${cell.kind}`
}

export function hasOwnDraft(drafts: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(drafts, key)
}

export function EditableTextCell({
  source,
  onChange
}: {
  source: string
  onChange: (source: string) => void
}): React.JSX.Element {
  return (
    <Textarea
      value={source}
      onChange={(event) => onChange(event.target.value)}
      className="bg-background text-foreground block min-h-24 w-full resize-y border-0 px-4 py-3 text-sm outline-none"
    />
  )
}
