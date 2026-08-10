import type {
  TerminalClearBufferResult,
  TerminalCloseResult,
  TerminalCreateInput,
  TerminalCreateResult,
  TerminalFocusResult,
  TerminalHandleInput,
  TerminalRenameInput,
  TerminalRenameResult,
  TerminalSplitInput,
  TerminalSplitResult,
  TerminalStopExactInput,
  TerminalStopExactResult,
  TerminalStopInput,
  TerminalStopResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export async function handleTerminalRename(
  params: TerminalRenameInput,
  { runtime }: RpcContext
): Promise<TerminalRenameResult> {
  return { rename: await runtime.renameTerminal(params.terminal, params.title || null) }
}

export async function handleTerminalClearBuffer(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalClearBufferResult> {
  return { clear: await runtime.clearTerminalBuffer(params.terminal) }
}

export async function handleTerminalCreate(
  params: TerminalCreateInput,
  { runtime }: RpcContext
): Promise<TerminalCreateResult> {
  return {
    terminal: await runtime.createTerminal(params.worktree, {
      command: params.command,
      startupCommandDelivery: params.startupCommandDelivery,
      env: params.env,
      envToDelete: params.envToDelete,
      ...(params.launchConfig ? { launchConfig: params.launchConfig } : {}),
      ...(params.launchToken ? { launchToken: params.launchToken } : {}),
      ...(params.launchAgent ? { launchAgent: params.launchAgent } : {}),
      title: params.title,
      focus: params.focus === true,
      rendererBacked: params.rendererBacked === true,
      activate: params.activate === true,
      presentation: params.presentation,
      tabId: params.tabId,
      leafId: params.leafId
    })
  }
}

export async function handleTerminalSplit(
  params: TerminalSplitInput,
  { runtime }: RpcContext
): Promise<TerminalSplitResult> {
  return {
    split: await runtime.splitTerminal(params.terminal, {
      direction: params.direction,
      command: params.command,
      env: params.env,
      telemetrySource: params.telemetrySource
    })
  }
}

export function handleTerminalStop(
  params: TerminalStopInput,
  { runtime }: RpcContext
): Promise<TerminalStopResult> {
  return runtime.stopTerminalsForWorktree(params.worktree)
}

export function handleTerminalStopExact(
  params: TerminalStopExactInput,
  { runtime }: RpcContext
): Promise<TerminalStopExactResult> {
  return runtime.stopExactTerminalsForWorktree(params.worktree, params.expectedPtyIds, {
    keepHistory: params.keepHistory,
    targetOnly: params.targetOnly
  })
}

export async function handleTerminalFocus(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalFocusResult> {
  return { focus: await runtime.focusTerminal(params.terminal) }
}

export async function handleTerminalClose(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalCloseResult> {
  return { close: await runtime.closeTerminal(params.terminal) }
}

export async function handleTerminalCloseTab(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalCloseResult> {
  return { close: await runtime.closeTerminalTab(params.terminal) }
}
