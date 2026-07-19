import { detectLanguage } from '@/lib/language-detect'
import { useAppStore } from '@/store'

export type EditorNavigationTarget = {
  filePath: string
  relativePath: string
  line: number
  column: number
}

export function openEditorNavigationTarget(
  worktreeId: string,
  runtimeEnvironmentId: string | null | undefined,
  target: EditorNavigationTarget
): void {
  const store = useAppStore.getState()
  store.openFile({
    filePath: target.filePath,
    relativePath: target.relativePath,
    worktreeId,
    language: detectLanguage(target.relativePath),
    mode: 'edit',
    runtimeEnvironmentId: runtimeEnvironmentId?.trim() || null
  })
  store.setPendingEditorReveal(null)

  // Why: opening a target may replace the visible model; wait for the same
  // two layout frames used by search navigation before publishing the reveal.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      store.setPendingEditorReveal({
        filePath: target.filePath,
        line: target.line,
        column: target.column,
        matchLength: 0
      })
    })
  })
}
