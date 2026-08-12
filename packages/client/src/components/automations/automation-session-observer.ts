import type { ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { getRuntimeTerminalMultiplexer } from '~renderer/runtime/terminal-multiplex/registry'
import {
  getRuntimeTerminalEnvironmentId,
  getRuntimeTerminalHandle
} from '~renderer/runtime/terminal-stream'
import { useAppStore } from '~renderer/store'
import { createAgentStatusOscProcessor } from '~shared/agent/status-osc'

export async function observeExistingAutomationSession(args: {
  ptyId: string
  paneKey: string
  runId: string
  onData: (chunk: string) => void
  onAgentStatus: (payload: ParsedAgentStatusPayload) => void
  onExit: (code: number) => void
}): Promise<() => void> {
  const terminal = getRuntimeTerminalHandle(args.ptyId)
  if (!terminal) {
    return () => {}
  }
  const environmentId = getRuntimeTerminalEnvironmentId(args.ptyId)
  const target = environmentId
    ? ({ kind: 'environment', environmentId } as const)
    : getActiveRuntimeTarget(useAppStore.getState().settings)
  const processAgentStatus = createAgentStatusOscProcessor()
  const stream = await getRuntimeTerminalMultiplexer(target).subscribeTerminal({
    terminal,
    client: { id: `desktop:automation-reuse:${args.runId}`, type: 'desktop' },
    callbacks: {
      onData: (data, _meta, onParsed) => {
        args.onData(data)
        for (const payload of processAgentStatus(data).payloads) {
          useAppStore.getState().setAgentStatus(args.paneKey, payload, undefined)
          args.onAgentStatus(payload)
        }
        onParsed()
      },
      onSnapshot: (_data, _meta, onParsed) => onParsed()
    }
  })
  let disposed = false
  void callRuntimeOrpc(
    target,
    (client) => client.terminal.wait,
    { terminal, for: 'exit' },
    { timeoutMs: 24 * 60 * 60 * 1_000 }
  )
    .then((result) => {
      if (!disposed) {
        args.onExit(result.wait.exitCode ?? 0)
      }
    })
    .catch(() => {})
  return () => {
    disposed = true
    stream.close()
  }
}
