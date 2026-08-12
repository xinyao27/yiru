import { z } from 'zod'

export const MOBILE_STATUS_GET_ORPC_PATH = '/status/get'
export const MOBILE_TERMINAL_LIST_ORPC_PATH = '/terminal/list'
export const MOBILE_TERMINAL_SHOW_ORPC_PATH = '/terminal/show'
export const MOBILE_TERMINAL_OPEN_MULTIPLEX_ORPC_PATH = '/terminal/openMultiplex'
export const MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH = '/terminal/multiplex'

export const MobileRuntimeStatusSchema = z.object({
  runtimeId: z.string(),
  capabilities: z.array(z.string()).optional()
})

export const MobileTerminalListRequestSchema = z.object({
  worktree: z.string().optional(),
  limit: z.number().int().positive().optional(),
  requireFreshPtyLiveness: z.boolean().optional()
})

// Why: native clients need terminal identity and liveness without depending on
// the renderer graph's complete visual-layout representation.
export const MobileTerminalSummarySchema = z.object({
  handle: z.string(),
  ptyId: z.string().nullable(),
  worktreeId: z.string(),
  worktreeInstanceId: z.string().nullable().optional(),
  worktreePath: z.string(),
  branch: z.string(),
  tabId: z.string(),
  leafId: z.string(),
  title: z.string().nullable(),
  connected: z.boolean(),
  writable: z.boolean(),
  lastOutputAt: z.number().int().nullable(),
  preview: z.string()
})

export const MobileTerminalListSchema = z.object({
  terminals: z.array(MobileTerminalSummarySchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean()
})

export const MobileTerminalHandleRequestSchema = z.object({ terminal: z.string().min(1) })

export const MobileTerminalShowSchema = MobileTerminalSummarySchema.extend({
  paneRuntimeId: z.number().int(),
  rendererGraphEpoch: z.number().int().nonnegative(),
  transportGeneration: z.string().min(1)
})

export const MobileTerminalOpenMultiplexRequestSchema = z.object({
  environmentId: z.string().min(1),
  clientInstanceId: z.string().min(1)
})

export const MobileTerminalOpenMultiplexSchema = z.object({
  bulkTicket: z.string().min(1),
  bulkEndpoint: z.string().url(),
  expiresAt: z.number().int().positive(),
  maxFrameBytes: z.number().int().positive()
})

export const MobileTerminalMultiplexInvocationSchema = z.object({
  i: z.string().min(1),
  p: z.object({
    u: z.literal(MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH),
    b: z.object({ json: z.object({ bulkTicket: z.string().min(1) }) }),
    h: z.record(z.string(), z.string())
  })
})

export const MobileTerminalMultiplexPeerMessageSchema = z.object({
  i: z.string().min(1),
  t: z.number().int().optional(),
  p: z.object({
    s: z.number().int().optional(),
    e: z.enum(['message', 'error', 'done']).optional(),
    d: z.object({ json: z.object({ type: z.literal('ready') }) }).optional()
  })
})

export type MobileRuntimeStatus = z.infer<typeof MobileRuntimeStatusSchema>
export type MobileTerminalList = z.infer<typeof MobileTerminalListSchema>
export type MobileTerminalListRequest = z.infer<typeof MobileTerminalListRequestSchema>
export type MobileTerminalShow = z.infer<typeof MobileTerminalShowSchema>
export type MobileTerminalOpenMultiplex = z.infer<typeof MobileTerminalOpenMultiplexSchema>
export type MobileTerminalOpenMultiplexRequest = z.infer<
  typeof MobileTerminalOpenMultiplexRequestSchema
>
