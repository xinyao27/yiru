import type { editor } from 'monaco-editor'
import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'

import { diffViewStateCache } from '@/components/editor/scroll-cache'

type DiffViewerFirstChangeScrollInput = {
  diffEditorRef: RefObject<editor.IStandaloneDiffEditor | null>
  modifiedEditor: editor.ICodeEditor | null
  modelKey: string
  pendingScrollForThisViewer: string | null
}

// Why: on a fresh open (no cached view state, no pending scroll-to-note),
// center the first diff change in the viewport. This runs from its own
// Effect — not from DiffOnMount — so it sequences AFTER the comment
// decorator inserts its view zones. If it scrolled during mount, late zone
// insertion would shift content downward and the user would land on a note
// further down the file instead of the first change.
//
// `getTopForLineNumber(line, /* includeViewZones */ true)` accounts for any
// zones already in the layout, so the math survives whatever the decorator
// added in this render pass. The didScroll guard makes this strictly
// one-shot per mount.
export function useDiffViewerFirstChangeScroll({
  diffEditorRef,
  modifiedEditor,
  modelKey,
  pendingScrollForThisViewer
}: DiffViewerFirstChangeScrollInput): void {
  const didAutoScrollFirstDiffRef = useRef(false)
  const didAutoScrollModelKeyRef = useRef(modelKey)

  useEffect(() => {
    if (didAutoScrollModelKeyRef.current !== modelKey) {
      didAutoScrollModelKeyRef.current = modelKey
      // Why: the one-shot above is intentionally per-modelKey. Reset inside
      // this Effect before its first-diff guard runs for the new file.
      didAutoScrollFirstDiffRef.current = false
    }
    const diffEditor = diffEditorRef.current
    if (!diffEditor || !modifiedEditor) {
      return
    }
    if (didAutoScrollFirstDiffRef.current) {
      return
    }
    if (diffViewStateCache.get(modelKey)) {
      return
    }
    if (pendingScrollForThisViewer) {
      // Why: the decorator owns this scroll for this mount, so permanently
      // yield by setting the one-shot flag. Otherwise, when the decorator
      // ack's and `pendingScrollForThisViewer` flips back to null, this
      // effect would re-run with empty cache + un-set flag and overwrite
      // the comment scroll with a jump to the first diff.
      didAutoScrollFirstDiffRef.current = true
      return
    }
    let rafId: number | null = null
    const run = (): void => {
      if (didAutoScrollFirstDiffRef.current) {
        return
      }
      const changes = diffEditor.getLineChanges()
      if (!changes || changes.length === 0) {
        return
      }
      const line = Math.max(1, changes[0].modifiedStartLineNumber)
      // Defer one frame so any view zones added in this render pass are part
      // of the layout before we measure. Cancel any earlier pending rAF so
      // a late onDidUpdateDiff can't enqueue a redundant scroll.
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (didAutoScrollFirstDiffRef.current || !modifiedEditor.getModel()) {
          return
        }
        const top = modifiedEditor.getTopForLineNumber(line, true)
        const editorHeight = modifiedEditor.getLayoutInfo().height
        modifiedEditor.setPosition({ lineNumber: line, column: 1 })
        modifiedEditor.setScrollTop(Math.max(0, top - editorHeight / 2))
        didAutoScrollFirstDiffRef.current = true
      })
    }
    // If the diff result is already available, run immediately; otherwise
    // wait for it. onDidUpdateDiff fires once the diff computation lands.
    if (diffEditor.getLineChanges()) {
      run()
    }
    const sub = diffEditor.onDidUpdateDiff(() => run())
    return () => {
      sub.dispose()
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [diffEditorRef, modelKey, modifiedEditor, pendingScrollForThisViewer])
}
