import type { ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'
import { isMainTerminalSideEffectAuthorityForPty } from '~renderer/components/terminal-pane/terminal-side-effect-facts-handler'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { isRemoteRuntimePtyId } from '~renderer/runtime/terminal-inspection'
import { getRuntimeTerminalMultiplexer } from '~renderer/runtime/terminal-multiplex/registry'
import {
  getRemoteRuntimePtyEnvironmentId,
  getRemoteRuntimeTerminalHandle
} from '~renderer/runtime/terminal-stream'
import { useAppStore } from '~renderer/store'
import { createAgentStatusOscProcessor } from '~shared/agent/status-osc'

import { subscribeToPtyData } from '../terminal-pane/pty/data-sidecar-subscriptions'
import { subscribeToPtyExit } from '../terminal-pane/pty/dispatcher'

export async function observeExistingAutomationSession(args: {
  ptyId: string
  paneKey: string
  runId: string
  onData: (chunk: string) => void
  onAgentStatus: (payload: ParsedAgentStatusPayload) => void
  onExit: (code: number) => void
}): Promise<() => void> {
  const { ptyId, paneKey, runId, onData, onExit } = args
  // Why: for local PTYs main already parses OSC 9999 and routes it
  // through the hook server (agent-status stream → store); writing here too
  // would race/duplicate that path. Remote-runtime bytes never transit local
  // main, and the kill switch restores the legacy write. The onAgentStatus
  // callback always fires — automation completion tracking stays here.
  const mainOwnsAgentStatusWrites =
    !isRemoteRuntimePtyId(ptyId) &&
    isMainTerminalSideEffectAuthorityForPty({
      settings: useAppStore.getState().settings,
      runtimeEnvironmentId: null
    })
  const processAgentStatus = createAgentStatusOscProcessor()
  const handleData = (data: string): void => {
    onData(data)
    const processed = processAgentStatus(data)
    for (const payload of processed.payloads) {
      if (!mainOwnsAgentStatusWrites) {
        useAppStore.getState().setAgentStatus(paneKey, payload, undefined)
      }
      args.onAgentStatus(payload)
    }
  }

  if (isRemoteRuntimePtyId(ptyId)) {
    let disposed = false
    const ownerEnvironmentId = getRemoteRuntimePtyEnvironmentId(ptyId)
    const runtimeTarget = ownerEnvironmentId
      ? ({ kind: 'environment', environmentId: ownerEnvironmentId } as const)
      : getActiveRuntimeTarget(useAppStore.getState().settings)
    const terminal = getRemoteRuntimeTerminalHandle(ptyId)
    if (!terminal) {
      return () => {}
    }
    const stream = await getRuntimeTerminalMultiplexer(runtimeTarget).subscribeTerminal({
      terminal,
      client: { id: `desktop:automation-reuse:${runId}`, type: 'desktop' },
      callbacks: {
        onData: (data, _meta, onParsed) => {
          handleData(data)
          onParsed()
        },
        onSnapshot: (_data, _meta, onParsed) => onParsed()
      }
    })
    void callRuntimeOrpc(
      runtimeTarget,
      (client) => client.terminal.wait,
      { terminal, for: 'exit' },
      { timeoutMs: 24 * 60 * 60 * 1000 }
    )
      .then((result) => {
        if (!disposed) {
          onExit(result.wait.exitCode ?? 0)
        }
      })
      .catch(() => {})
    return () => {
      disposed = true
      stream.close()
    }
  }

  const unsubscribeData = subscribeToPtyData(ptyId, handleData)
  const unsubscribeExit = subscribeToPtyExit(ptyId, onExit)
  return () => {
    unsubscribeData()
    unsubscribeExit()
  }
}
