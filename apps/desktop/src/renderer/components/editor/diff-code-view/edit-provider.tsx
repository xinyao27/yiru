import { Editor } from '@pierre/diffs/edit'
import { EditProvider } from '@pierre/diffs/react'
import { useCallback } from 'react'

import type { DiffCodeViewAnnotation } from './annotations'

const DIFF_CODE_VIEW_HISTORY_MAX_ENTRIES = 500

/**
 * Supplies the editor every editable Pierre surface shares.
 *
 * Why: CodeView owns editor lifecycle — it attaches on mount, re-attaches
 * across virtualization unmounts and disposes once a row stops being editable —
 * but it never constructs one. This is the factory it reaches for.
 */
export function DiffCodeViewEditProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const createEditor = useCallback(
    (options: ConstructorParameters<typeof Editor<DiffCodeViewAnnotation>>[0]) =>
      new Editor<DiffCodeViewAnnotation>({
        ...options,
        historyMaxEntries: DIFF_CODE_VIEW_HISTORY_MAX_ENTRIES,
        // Why: Pierre's docs call this out for Electron — the DOM clipboard is
        // unreliable in the renderer, so route through the main process.
        clipboard: { readText: () => window.api.ui.readClipboardText() }
      }),
    []
  )
  return <EditProvider createEditor={createEditor}>{children}</EditProvider>
}
