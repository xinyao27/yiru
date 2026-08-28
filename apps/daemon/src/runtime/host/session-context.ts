import type {
  RuntimeTerminalListResult,
  RuntimeTerminalRead
} from '@yiru/runtime-protocol/workbench/runtime-types'

type SessionContextRuntime = {
  listTerminals: (worktreeSelector?: string, limit?: number) => Promise<RuntimeTerminalListResult>
  readTerminal: (handle: string, options?: { limit?: number }) => Promise<RuntimeTerminalRead>
}

export async function readWorkbenchSessionContext(
  runtime: SessionContextRuntime,
  worktreeIds: ReadonlySet<string>,
  maxChars = 12_000
): Promise<string> {
  const result = await runtime.listTerminals(undefined, 500)
  const terminals = result.terminals
    .filter((terminal) => worktreeIds.has(terminal.worktreeId))
    .sort((left, right) => (right.lastOutputAt ?? 0) - (left.lastOutputAt ?? 0))
    .slice(0, 3)
  const entries = await Promise.all(
    terminals.map(async (terminal) => {
      const read = await runtime.readTerminal(terminal.handle, { limit: 200 })
      const output = Bun.stripANSI(read.tail.join('\n')).replaceAll('\r', '').slice(-4_000)
      return `Session ${terminal.title ?? terminal.handle} (${terminal.branch}):\n${output}`
    })
  )
  return entries.join('\n\n').slice(-maxChars)
}
