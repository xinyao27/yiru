import { reportRendererErrorCrash } from '~renderer/lib/renderer-error-reporting'

export function reportTerminalPaneError(error: unknown, originId = 'terminal-pane'): void {
  const reportError = error instanceof Error ? error : new Error(String(error))
  if (!(error instanceof Error)) {
    reportError.name = 'TerminalError'
  }
  void reportRendererErrorCrash({
    kind: 'terminal-error',
    originId,
    surface: 'terminal-workbench',
    error: reportError
  })
}
