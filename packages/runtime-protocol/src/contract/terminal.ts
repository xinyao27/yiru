import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import * as inputs from './terminal-inputs.js'
import { terminalManagementContract } from './terminal-management.js'
import type * as results from './terminal-results.js'

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const WORKTREE_READ_ACCESS = { scope: 'worktree', tier: 'read' } as const
const WORKTREE_CONTROL_ACCESS = { scope: 'worktree', tier: 'control' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const terminalContract = {
  multiplex: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalMultiplexInputSchema)
    .output(eventIterator(type<results.TerminalMultiplexEvent>())),
  subscribe: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalSubscribeInputSchema)
    .output(eventIterator(type<results.TerminalSubscribeEvent>())),
  list: withAccess(HOST_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalListInputSchema)
    .output(type<results.TerminalListResult>()),
  resolveActive: withAccess(HOST_READ_ACCESS)
    .input(inputs.TerminalResolveActiveInputSchema)
    .output(type<results.TerminalResolveActiveResult>()),
  resolvePane: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.TerminalResolvePaneInputSchema)
    .output(type<results.TerminalResolvePaneResult>()),
  show: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalShowResult>()),
  read: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalReadInputSchema)
    .output(type<results.TerminalReadResult>()),
  inspectProcess: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalProcessInspectionResult>()),
  isRunningAgent: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalIsRunningAgentResult>()),
  agentStatus: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalAgentStatusResult>()),
  rename: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalRenameInputSchema)
    .output(type<results.TerminalRenameResult>()),
  clearBuffer: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalClearBufferResult>()),
  send: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalSendInputSchema)
    .output(type<results.TerminalSendResult>()),
  wait: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalWaitInputSchema)
    .output(type<results.TerminalWaitResult>()),
  create: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalCreateInputSchema)
    .output(type<results.TerminalCreateResult>()),
  split: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.TerminalSplitInputSchema)
    .output(type<results.TerminalSplitResult>()),
  stop: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.TerminalStopInputSchema)
    .output(type<results.TerminalStopResult>()),
  stopExact: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.TerminalStopExactInputSchema)
    .output(type<results.TerminalStopExactResult>()),
  resizeForClient: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.TerminalResizeForClientInputSchema)
    .output(type<results.TerminalResizeForClientResult>()),
  focus: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalFocusResult>()),
  close: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalCloseResult>()),
  closeTab: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalCloseResult>()),
  setDisplayMode: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalSetDisplayModeInputSchema)
    .output(type<results.TerminalSetDisplayModeResult>()),
  restoreFit: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalRestoreFitResult>()),
  getDisplayMode: withAccess(WORKTREE_READ_ACCESS)
    .input(inputs.TerminalHandleInputSchema)
    .output(type<results.TerminalGetDisplayModeResult>()),
  updateViewport: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalUpdateViewportInputSchema)
    .output(type<results.TerminalUpdateViewportResult>()),
  unsubscribe: withAccess(WORKTREE_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalUnsubscribeInputSchema)
    .output(type<results.TerminalUnsubscribeResult>()),
  getAutoRestoreFit: withAccess(HOST_READ_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalEmptyInputSchema)
    .output(type<results.TerminalAutoRestoreFitResult>()),
  setAutoRestoreFit: withAccess(HOST_HOST_ACCESS, MOBILE_CLIENT)
    .input(inputs.TerminalSetAutoRestoreFitInputSchema)
    .output(type<results.TerminalAutoRestoreFitResult>()),
  management: terminalManagementContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './terminal-inputs.js'
export * from './terminal-management.js'
export * from './terminal-results.js'
