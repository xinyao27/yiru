import type {
  TerminalAgentStatusResult,
  TerminalHandleInput,
  TerminalIsRunningAgentResult,
  TerminalListInput,
  TerminalListResult,
  TerminalProcessInspectionResult,
  TerminalReadInput,
  TerminalReadResult,
  TerminalResolveActiveInput,
  TerminalResolveActiveResult,
  TerminalResolvePaneInput,
  TerminalResolvePaneResult,
  TerminalShowResult,
  TerminalWaitInput,
  TerminalWaitResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export function handleTerminalList(
  params: TerminalListInput,
  { runtime }: RpcContext
): Promise<TerminalListResult> {
  return runtime.listTerminals(params.worktree, params.limit, {
    requireFreshPtyLiveness: params.requireFreshPtyLiveness
  })
}

export async function handleTerminalResolveActive(
  params: TerminalResolveActiveInput,
  { runtime }: RpcContext
): Promise<TerminalResolveActiveResult> {
  return { handle: await runtime.resolveActiveTerminal(params.worktree) }
}

export async function handleTerminalResolvePane(
  params: TerminalResolvePaneInput,
  { runtime }: RpcContext
): Promise<TerminalResolvePaneResult> {
  return { terminal: runtime.resolveTerminalPane(params.paneKey) }
}

export async function handleTerminalShow(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalShowResult> {
  return { terminal: await runtime.showTerminal(params.terminal) }
}

export async function handleTerminalRead(
  params: TerminalReadInput,
  { runtime }: RpcContext
): Promise<TerminalReadResult> {
  return {
    terminal: await runtime.readTerminal(params.terminal, {
      cursor: params.cursor,
      limit: params.limit
    })
  }
}

export async function handleTerminalInspectProcess(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalProcessInspectionResult> {
  return { process: await runtime.inspectTerminalProcess(params.terminal) }
}

export async function handleTerminalIsRunningAgent(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalIsRunningAgentResult> {
  return { isRunningAgent: await runtime.isTerminalRunningAgent(params.terminal) }
}

export async function handleTerminalAgentStatus(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalAgentStatusResult> {
  return { agentStatus: await runtime.getTerminalAgentStatus(params.terminal) }
}

export async function handleTerminalWait(
  params: TerminalWaitInput,
  { runtime, signal }: RpcContext
): Promise<TerminalWaitResult> {
  return {
    wait: await runtime.waitForTerminal(params.terminal, {
      condition: params.for,
      timeoutMs: params.timeoutMs,
      signal
    })
  }
}
