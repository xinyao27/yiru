import { detectLanguage } from '@/lib/language-detect'
import { useAppStore } from '@/store'
import type { LanguageServerNavigationTarget } from '@/lib/monaco-language-server-manager'

export function openLanguageServerDefinition(
  worktreeId: string,
  target: LanguageServerNavigationTarget
): void {
  const store = useAppStore.getState()
  store.openFile({
    filePath: target.filePath,
    relativePath: target.relativePath,
    worktreeId,
    language: detectLanguage(target.relativePath),
    mode: 'edit',
    runtimeEnvironmentId: null
  })
  store.setPendingEditorReveal(null)

  // Why: opening a definition may replace the visible model; wait for the same
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
