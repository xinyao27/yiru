export type ShutdownBufferCaptureOptions = {
  includeLocalBuffers?: boolean
}

/** Map of tabId → buffer-capture callback, one per mounted TerminalPane.
 *  The beforeunload handler in application-shell.tsx invokes every callback to populate
 *  Zustand with serialized buffers before flushing the session to disk.
 *  Sleep (shutdownWorktreeTerminals with keepIdentifiers: true) iterates
 *  only the entries whose tabId belongs to the worktree being slept, so
 *  SSH worktrees can capture scrollback before the relay SIGKILLs the
 *  remote PTY — see DESIGN_DOC_TERMINAL_HISTORY_FIX_V2.md §3.3.c.
 *
 *  Why this lives in its own module: the registry is shared between
 *  terminal-pane.tsx (registration site) and the terminals store slice
 *  (sleep-time iteration). Importing it directly from TerminalPane would
 *  create a cycle (slice → TerminalPane → store → slice) that breaks the
 *  Zustand store at module-init time. A leaf module with zero imports
 *  has no cycle. */
export const shutdownBufferCaptures = new Map<
  string,
  (options?: ShutdownBufferCaptureOptions) => void
>()

export function captureTerminalShutdownBuffersBestEffort(
  tabIds: readonly string[],
  options?: ShutdownBufferCaptureOptions
): { requested: number; captured: number } {
  let captured = 0
  for (const tabId of tabIds) {
    const capture = shutdownBufferCaptures.get(tabId)
    if (!capture) {
      continue
    }
    try {
      capture(options)
      captured += 1
    } catch {
      // Why: scrollback is recovery evidence; one serializer failure must not
      // prevent the retention budget from releasing every other pane.
    }
  }
  return { requested: tabIds.length, captured }
}
