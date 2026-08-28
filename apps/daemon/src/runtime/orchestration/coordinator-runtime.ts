export type CoordinatorRuntime = {
  sendTerminalAgentPrompt(handle: string, prompt: string): Promise<unknown>
  listTerminals(
    worktreeSelector?: string,
    limit?: number
  ): Promise<{
    terminals: { handle: string; worktreeId: string; connected: boolean; writable: boolean }[]
  }>
  createTerminal(
    worktreeSelector?: string,
    opts?: { command?: string; title?: string }
  ): Promise<{ handle: string; worktreeId: string }>
  waitForTerminal(
    handle: string,
    options?: { condition?: string; timeoutMs?: number }
  ): Promise<{ handle: string; condition: string }>
  probeWorktreeDrift(worktreeSelector: string): Promise<{
    base: string
    behind: number
    recentSubjects: string[]
  } | null>
  getTerminalPaneKey?(handle: string): string | null
  getTerminalOrchestrationCliCommand?(handle: string): string
}
