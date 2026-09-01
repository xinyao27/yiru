import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

import { HUNKS, NOTE_TARGETS, tokenize, type DiffLine } from './review-animated-visual-shared'

// Why: pre-flatten hunks into rows with computed line numbers so the
// imperative animation loop only mutates classes/inline styles, never DOM
// structure. Lives in its own module to keep ReviewNotesAnimatedVisual under
// the per-file line-length lint cap.

type DiffRow = {
  key: string
  kind: 'header' | 'line' | 'slot'
  hunk: number
  lineIdx?: number
  diffKind?: DiffLine['kind']
  headerText?: string
  oldNo?: string
  newNo?: string
  mark?: string
  text?: string
}

function buildDiffRows(): DiffRow[] {
  const result: DiffRow[] = []
  HUNKS.forEach((h, hi) => {
    let oldNo = h.oldStart - 1
    let newNo = h.newStart - 1
    result.push({ key: `h${hi}-hdr`, kind: 'header', hunk: hi, headerText: h.header })
    h.lines.forEach((ln, li) => {
      let ol = ''
      let nl = ''
      let mark = ' '
      if (ln.kind === 'ctx') {
        oldNo += 1
        newNo += 1
        ol = String(oldNo)
        nl = String(newNo)
      } else if (ln.kind === 'add') {
        newNo += 1
        nl = String(newNo)
        mark = '+'
      } else {
        oldNo += 1
        ol = String(oldNo)
        mark = '-'
      }
      result.push({
        key: `h${hi}-l${li}`,
        kind: 'line',
        hunk: hi,
        lineIdx: li,
        diffKind: ln.kind,
        oldNo: ol,
        newNo: nl,
        mark,
        text: ln.t
      })
    })
    result.push({ key: `h${hi}-slot`, kind: 'slot', hunk: hi })
  })
  return result
}

export function ReviewDiffRows({ visibleNoteCount }: { visibleNoteCount: number }): JSX.Element {
  const rows = buildDiffRows()
  return (
    <>
      {rows.map((r) => {
        if (r.kind === 'header') {
          return (
            <div key={r.key} className="ravs-hunk-header">
              <span />
              <span />
              <span />
              <span className="ravs-text">{r.headerText}</span>
            </div>
          )
        }
        if (r.kind === 'slot') {
          const targetIndex = NOTE_TARGETS.findIndex((target) => target.hunk === r.hunk)
          const target = NOTE_TARGETS[targetIndex]
          const targetRow = rows.find(
            (row) =>
              row.kind === 'line' && row.hunk === target?.hunk && row.lineIdx === target?.lineIdx
          )
          return (
            <div
              key={r.key}
              className={cn(
                'ravs-note-row',
                targetIndex >= 0 && targetIndex < visibleNoteCount && 'is-visible'
              )}
            >
              <div className="ravs-note-card">
                <div className="ravs-note-meta">
                  {translate(
                    'auto.components.feature.wall.review.notes.diff.rows.f621c734f8',
                    'Note · line'
                  )}
                  <span>{targetRow?.newNo || targetRow?.oldNo || '?'}</span>
                </div>
                <div className="ravs-note-body">{target?.body}</div>
              </div>
            </div>
          )
        }
        return (
          <div
            key={r.key}
            className={cn(
              'ravs-diff-line',
              r.diffKind === 'add' && 'is-add',
              r.diffKind === 'rem' && 'is-rem'
            )}
            data-hunk-idx={r.hunk}
            data-line-idx={r.lineIdx}
          >
            <span className="ravs-ln">{r.oldNo}</span>
            <span className="ravs-ln">{r.newNo}</span>
            <span className="ravs-marker">{r.mark}</span>
            <span
              className="ravs-text-cell"
              dangerouslySetInnerHTML={{ __html: tokenize(r.text ?? '') }}
            />
          </div>
        )
      })}
    </>
  )
}
