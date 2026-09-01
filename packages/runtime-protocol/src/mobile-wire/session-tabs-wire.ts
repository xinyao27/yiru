import { z } from 'zod'

import type {
  RuntimeMobileSessionCreateTerminalResult,
  RuntimeMobileSessionTabCloseResult,
  RuntimeMobileSessionTabsAllStreamEvent,
  RuntimeMobileSessionTabsListAllResult,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsStreamEvent
} from '../contract/session-tabs-types.js' with {
  'resolution-mode': 'import'
}
import { MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH } from '../model/ui.js'

export const MOBILE_SESSION_TABS_LIST_ORPC_PATH = '/session/tabs/list'
export const MOBILE_SESSION_TABS_LIST_ALL_ORPC_PATH = '/session/tabs/listAll'
export const MOBILE_SESSION_TABS_SUBSCRIBE_ORPC_PATH = '/session/tabs/subscribe'
export const MOBILE_SESSION_TABS_SUBSCRIBE_ALL_ORPC_PATH = '/session/tabs/subscribeAll'
export const MOBILE_SESSION_TABS_ACTIVATE_ORPC_PATH = '/session/tabs/activate'
export const MOBILE_SESSION_TABS_CLOSE_ORPC_PATH = '/session/tabs/close'
export const MOBILE_SESSION_TABS_CREATE_TERMINAL_ORPC_PATH = '/session/tabs/createTerminal'

export const MobileSessionTabsWorktreeRequestSchema = z.object({
  worktree: z.string().min(1)
})

const MobileSleepingAgentLaunchConfigSchema = z.object({
  agentCommand: z.string().optional(),
  agentArgs: z.string(),
  agentEnv: z.record(z.string(), z.string()),
  ompResumeFilePath: z
    .string()
    .min(1)
    .max(32 * 1024)
    .optional()
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
    clientMutationId: z.string().min(1).max(128).optional(),
    agent: z.string().min(1).optional(),
    command: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    envToDelete: z.array(z.string().min(1).max(256)).max(32).optional(),
    launchConfig: MobileSleepingAgentLaunchConfigSchema.optional(),
    launchAgent: z.string().min(1).optional(),
    startupCommandDelivery: z.enum(['fast', 'shell-ready']).optional(),
    agentPrompt: z.string().max(MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH).optional()
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
  launchAgent: z.string().optional(),
  resolvedAgentType: z.string().optional(),
  agentStatus: z
    .object({
      state: z.enum(['working', 'blocked', 'waiting', 'done']),
      paneKey: z.string().optional(),
      prompt: z.string().optional(),
      updatedAt: z.number().optional(),
      stateStartedAt: z.number().optional(),
      agentType: z.string().optional(),
      interactivePrompt: z.string().optional(),
      lastAssistantMessage: z.string().optional(),
      toolName: z.string().optional(),
      toolInput: z.string().optional(),
      interrupted: z.boolean().optional(),
      providerSession: z
        .object({
          key: z.enum(['session_id', 'conversation_id']),
          id: z.string(),
          transcriptPath: z.string().optional()
        })
        .optional()
    })
    .nullable()
    .optional()
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
  language: z.literal('markdown'),
  mode: z.enum(['edit', 'markdown-preview']),
  isDirty: z.boolean(),
  sourceFileId: z.string(),
  sourceFilePath: z.string(),
  sourceRelativePath: z.string(),
  documentVersion: z.string()
})

export const MobileSessionFileTabWireSchema = MobileSessionTabBaseSchema.extend({
  type: z.literal('file'),
  filePath: z.string(),
  relativePath: z.string(),
  language: z.string(),
  mode: z.enum(['edit', 'diff']).optional(),
  diffSource: z.enum(['staged', 'unstaged']).optional(),
  isDirty: z.boolean()
})

export const MobileSessionBrowserTabWireSchema = MobileSessionTabBaseSchema.extend({
  type: z.literal('browser'),
  browserWorkspaceId: z.string(),
  browserPageId: z.string().nullable(),
  url: z.string(),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean()
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

export const MobileSessionTabsListAllWireSchema = z.object({
  snapshots: z.array(MobileSessionTabsWireSchema)
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

export const MobileSessionTabsAllEventWireSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshots'), snapshots: z.array(MobileSessionTabsWireSchema) }),
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

export const MOBILE_SESSION_TABS_LIST_ALL_WIRE_IS_COMPATIBLE: RuntimeMobileSessionTabsListAllResult extends z.infer<
  typeof MobileSessionTabsListAllWireSchema
>
  ? true
  : false = true

export const MOBILE_SESSION_TABS_ALL_EVENT_WIRE_IS_COMPATIBLE: RuntimeMobileSessionTabsAllStreamEvent extends z.infer<
  typeof MobileSessionTabsAllEventWireSchema
>
  ? true
  : false = true
