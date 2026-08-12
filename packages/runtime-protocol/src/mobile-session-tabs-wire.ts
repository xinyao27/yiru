import { z } from 'zod'

import type {
  RuntimeMobileSessionCreateTerminalResult,
  RuntimeMobileSessionTabCloseResult,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsStreamEvent
} from './contract/session-tabs-types.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_SESSION_TABS_LIST_ORPC_PATH = '/session/tabs/list'
export const MOBILE_SESSION_TABS_SUBSCRIBE_ORPC_PATH = '/session/tabs/subscribe'
export const MOBILE_SESSION_TABS_ACTIVATE_ORPC_PATH = '/session/tabs/activate'
export const MOBILE_SESSION_TABS_CLOSE_ORPC_PATH = '/session/tabs/close'
export const MOBILE_SESSION_TABS_CREATE_TERMINAL_ORPC_PATH = '/session/tabs/createTerminal'

export const MobileSessionTabsWorktreeRequestSchema = z.object({
  worktree: z.string().min(1)
})

export const MobileSessionTabMutationRequestSchema = MobileSessionTabsWorktreeRequestSchema.extend({
  tabId: z.string().min(1),
  leafId: z.string().max(128).optional(),
  notifyClients: z.boolean().optional()
})

export const MobileSessionCreateTerminalRequestSchema =
  MobileSessionTabsWorktreeRequestSchema.extend({
    afterTabId: z.string().min(1).optional(),
    activate: z.boolean().optional(),
    clientMutationId: z.string().min(1).max(128).optional()
  })

const MobileSessionTabBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  isActive: z.boolean(),
  color: z.string().nullable().optional(),
  isPinned: z.boolean().optional()
})

const MobileSessionTerminalTabBaseSchema = MobileSessionTabBaseSchema.extend({
  type: z.literal('terminal'),
  parentTabId: z.string().min(1),
  leafId: z.string().min(1),
  ptyId: z.string().nullable().optional(),
  viewMode: z.enum(['terminal', 'chat']).optional()
})

export const MobileSessionTerminalTabWireSchema = z.discriminatedUnion('status', [
  MobileSessionTerminalTabBaseSchema.extend({
    status: z.literal('pending-handle'),
    terminal: z.null()
  }),
  MobileSessionTerminalTabBaseSchema.extend({
    status: z.literal('ready'),
    terminal: z.string().min(1),
    worktreeInstanceId: z.string().nullable().optional()
  })
])

export const MobileSessionMarkdownTabWireSchema = MobileSessionTabBaseSchema.extend({
  type: z.literal('markdown'),
  filePath: z.string(),
  relativePath: z.string(),
  isDirty: z.boolean()
})

export const MobileSessionFileTabWireSchema = MobileSessionTabBaseSchema.extend({
  type: z.literal('file'),
  filePath: z.string(),
  relativePath: z.string(),
  isDirty: z.boolean()
})

export const MobileSessionBrowserTabWireSchema = MobileSessionTabBaseSchema.extend({
  type: z.literal('browser'),
  browserPageId: z.string().nullable(),
  url: z.string(),
  loading: z.boolean()
})

export const MobileSessionTabWireSchema = z.union([
  MobileSessionTerminalTabWireSchema,
  MobileSessionMarkdownTabWireSchema,
  MobileSessionFileTabWireSchema,
  MobileSessionBrowserTabWireSchema
])

export const MobileSessionTabsWireSchema = z.object({
  worktree: z.string().min(1),
  publicationEpoch: z.string().min(1),
  snapshotVersion: z.number().int().nonnegative(),
  activeTabId: z.string().nullable(),
  activeTabType: z.enum(['terminal', 'markdown', 'file', 'browser']).nullable(),
  tabs: z.array(MobileSessionTabWireSchema)
})

export const MobileSessionCreateTerminalResultWireSchema = z.object({
  tab: MobileSessionTerminalTabWireSchema,
  publicationEpoch: z.string().min(1),
  snapshotVersion: z.number().int().nonnegative()
})

export const MobileSessionTabCloseResultWireSchema = z.object({
  closed: z.literal(true)
})

export const MobileSessionTabsEventWireSchema = z.discriminatedUnion('type', [
  MobileSessionTabsWireSchema.extend({ type: z.literal('snapshot') }),
  MobileSessionTabsWireSchema.extend({ type: z.literal('updated') }),
  z.object({ type: z.literal('end') })
])

export type MobileSessionTabsWire = z.infer<typeof MobileSessionTabsWireSchema>

// Why: the native projection intentionally ignores renderer-only fields, but every runtime
// snapshot must remain assignable to it so new tab kinds or changed identities fail typecheck.
export const MOBILE_SESSION_TABS_WIRE_IS_COMPATIBLE: RuntimeMobileSessionTabsResult extends MobileSessionTabsWire
  ? true
  : false = true

export const MOBILE_SESSION_CREATE_TERMINAL_WIRE_IS_COMPATIBLE: RuntimeMobileSessionCreateTerminalResult extends z.infer<
  typeof MobileSessionCreateTerminalResultWireSchema
>
  ? true
  : false = true

export const MOBILE_SESSION_CLOSE_WIRE_IS_COMPATIBLE: RuntimeMobileSessionTabCloseResult extends z.infer<
  typeof MobileSessionTabCloseResultWireSchema
>
  ? true
  : false = true

export const MOBILE_SESSION_TABS_EVENT_WIRE_IS_COMPATIBLE: RuntimeMobileSessionTabsStreamEvent extends z.infer<
  typeof MobileSessionTabsEventWireSchema
>
  ? true
  : false = true
