import { getTerminalWebglAutoDecision } from './terminal-webgl-auto-policy'
import type { ManagedPaneInternal, PaneRenderingDiagnostics } from './types'

export function refreshManagedPanes(panes: Iterable<ManagedPaneInternal>): void {
  for (const pane of panes) {
    try {
      if (pane.terminal.rows > 0) {
        pane.terminal.refresh(0, pane.terminal.rows - 1)
      }
    } catch {
      // Why: restore repaint is best-effort while panes mount or tear down.
    }
  }
}

export function getManagedPaneRenderingDiagnostics(
  panes: Iterable<ManagedPaneInternal>
): PaneRenderingDiagnostics[] {
  return Array.from(panes).map((pane) => ({
    paneId: pane.id,
    terminalGpuAcceleration: pane.terminalGpuAcceleration,
    gpuRenderingEnabled: pane.gpuRenderingEnabled,
    webglAttachmentDeferred: pane.webglAttachmentDeferred,
    webglDisabledAfterContextLoss: pane.webglDisabledAfterContextLoss,
    hasComplexScriptOutput: pane.hasComplexScriptOutput,
    terminalWebglAutoDecision: getTerminalWebglAutoDecision(),
    hasWebgl: Boolean(pane.webglAddon)
  }))
}
