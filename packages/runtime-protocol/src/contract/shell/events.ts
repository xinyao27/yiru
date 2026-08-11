import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'
import type { ShellUiEvent } from './ui-events.js'

export type ShellBrowserContextMenuRequestedEvent = {
  type: 'browserContextMenuRequested'
  browserPageId: string
  x: number
  y: number
  screenX: number
  screenY: number
  pageUrl: string
  linkUrl: string | null
  selectionText: string
  canGoBack: boolean
  canGoForward: boolean
}

export type ShellBrowserEvent =
  | ShellBrowserContextMenuRequestedEvent
  | { type: 'browserContextMenuDismissed'; browserPageId: string }
  | { type: 'browserActivateView'; worktreeId?: string; browserPageId?: string }
  | { type: 'browserPaneFocus'; worktreeId: string | null; browserPageId: string }
  | { type: 'browserGrabModeToggle'; browserPageId: string }
  | { type: 'browserGrabActionShortcut'; browserPageId: string; key: 'c' | 's' }

export type ShellStateEvent =
  | { type: 'settingsChanged' }
  | { type: 'keybindingsChanged'; snapshot: unknown }

export type ShellEvent = ShellBrowserEvent | ShellStateEvent | ShellUiEvent

export type SequencedShellEvent = ShellEvent & { seq: number }

export type ShellSubscriptionEvent =
  | { type: 'ready'; seq: number }
  | { type: 'resync'; seq: number }
  | SequencedShellEvent

export type ShellEventsSubscribeInput = { lastSeenSeq?: number }

export type * from './ui-events.js'

const SHELL_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const

export const shellEventsContract = {
  subscribe: withAccess(SHELL_READ_ACCESS)
    .input(type<ShellEventsSubscribeInput>())
    .output(eventIterator(type<ShellSubscriptionEvent>()))
} satisfies ContractRouter<RuntimeProcedureMeta>
