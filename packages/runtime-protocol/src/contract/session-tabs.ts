import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  ActivateTab,
  CreateTerminalTab,
  MoveTab,
  SaveMarkdownTab,
  SessionTabsUnsubscribe,
  SessionTabsUnsubscribeAll,
  SetTabProps,
  UpdatePaneLayout,
  WorktreeTabSelector
} from './session-tabs-input.js'
import type {
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult,
  RuntimeMobileSessionCreateTerminalResult,
  RuntimeMobileSessionTabCloseResult,
  RuntimeMobileSessionTabMoveResult,
  RuntimeMobileSessionTabsListAllResult,
  RuntimeMobileSessionTabsAllStreamEvent,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsStreamEvent,
  RuntimeMobileSessionTabsUnsubscribeResult,
  RuntimeMobileSessionTabUpdateResult
} from './session-tabs-types.js'

const WORKTREE_READ_ACCESS = { scope: 'worktree', tier: 'read' } as const
const WORKTREE_CONTROL_ACCESS = { scope: 'worktree', tier: 'control' } as const
const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const MOBILE = { mobile: true } as const

export const sessionTabsContract = {
  subscribe: withAccess(WORKTREE_READ_ACCESS, MOBILE)
    .input(WorktreeTabSelector)
    .output(eventIterator(type<RuntimeMobileSessionTabsStreamEvent>())),
  subscribeAll: withAccess(HOST_READ_ACCESS, MOBILE)
    .input(type<void>())
    .output(eventIterator(type<RuntimeMobileSessionTabsAllStreamEvent>())),
  list: withAccess(WORKTREE_READ_ACCESS, MOBILE)
    .input(WorktreeTabSelector)
    .output(type<RuntimeMobileSessionTabsResult>()),
  listAll: withAccess(HOST_READ_ACCESS, MOBILE)
    .input(type<void>())
    .output(type<RuntimeMobileSessionTabsListAllResult>()),
  activate: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(ActivateTab)
    .output(type<RuntimeMobileSessionTabsResult>()),
  close: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(ActivateTab)
    .output(type<RuntimeMobileSessionTabCloseResult>()),
  createTerminal: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(CreateTerminalTab)
    .output(type<RuntimeMobileSessionCreateTerminalResult>()),
  move: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(MoveTab)
    .output(type<RuntimeMobileSessionTabMoveResult>()),
  updatePaneLayout: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(UpdatePaneLayout)
    .output(type<RuntimeMobileSessionTabUpdateResult>()),
  setTabProps: withAccess(WORKTREE_CONTROL_ACCESS)
    .input(SetTabProps)
    .output(type<RuntimeMobileSessionTabUpdateResult>()),
  unsubscribe: withAccess(WORKTREE_READ_ACCESS, MOBILE)
    .input(SessionTabsUnsubscribe)
    .output(type<RuntimeMobileSessionTabsUnsubscribeResult>()),
  unsubscribeAll: withAccess(WORKTREE_READ_ACCESS, MOBILE)
    .input(SessionTabsUnsubscribeAll)
    .output(type<RuntimeMobileSessionTabsUnsubscribeResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const sessionContract = {
  tabs: sessionTabsContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export const markdownContract = {
  readTab: withAccess(WORKTREE_READ_ACCESS, MOBILE)
    .input(ActivateTab)
    .output(type<RuntimeMarkdownReadTabResult>()),
  saveTab: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE)
    .input(SaveMarkdownTab)
    .output(type<RuntimeMarkdownSaveTabResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './session-tabs-input.js'
export type * from './session-tabs-types.js'
