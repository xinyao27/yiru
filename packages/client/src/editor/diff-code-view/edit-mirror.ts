import { useEffect, useRef } from 'react'

/**
 * Keeps the live document of every editing row, and writes what is still
 * pending when the surface goes away.
 *
 * Why: CodeView reports a finished edit session on edit-off, collapse or
 * removal, but not on teardown — `reset()` disposes each editor without
 * reporting, and the React wrapper calls it on every detach. Without a mirror,
 * closing a tab mid-edit drops the change silently.
 */
export function useDiffCodeViewEditMirror(
  onFileEditChange: ((fileKey: string, contents: string) => void) | undefined,
  onFileEditComplete: ((fileKey: string, contents: string) => void) | undefined
): {
  onItemEditChange: (item: { id: string }, editedFile: { contents: string }) => void
  onItemEditComplete: (item: { id: string }, editedFile: { contents: string }) => void
} {
  const pendingEditsRef = useRef(new Map<string, string>())
  const onFileEditChangeRef = useRef(onFileEditChange)
  const onFileEditCompleteRef = useRef(onFileEditComplete)
  onFileEditChangeRef.current = onFileEditChange
  onFileEditCompleteRef.current = onFileEditComplete

  useEffect(() => {
    const pendingEdits = pendingEditsRef.current
    return () => {
      for (const [fileKey, contents] of pendingEdits) {
        onFileEditCompleteRef.current?.(fileKey, contents)
      }
      pendingEdits.clear()
    }
  }, [])

  const onItemEditChange = (item: { id: string }, editedFile: { contents: string }) => {
    pendingEditsRef.current.set(item.id, editedFile.contents)
    onFileEditChangeRef.current?.(item.id, editedFile.contents)
  }
  const onItemEditComplete = (item: { id: string }, editedFile: { contents: string }) => {
    pendingEditsRef.current.delete(item.id)
    onFileEditCompleteRef.current?.(item.id, editedFile.contents)
  }
  return { onItemEditChange, onItemEditComplete }
}
