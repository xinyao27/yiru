import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RuntimeWorkspaceEventPayload = Record<string, boolean | number | string | null>

export type RuntimeWorkspaceEvent = {
  id: number
  kind: string
  occurredAt: number
  payload: RuntimeWorkspaceEventPayload
  revision: number
  scope: string
}

export type RuntimeWorkspaceEventListResult = {
  events: RuntimeWorkspaceEvent[]
  latestId: number
  revision: number
}

export type RuntimeWorkspaceEventSubscriptionEvent =
  | {
      revision: number
      type: 'ready'
    }
  | {
      event: RuntimeWorkspaceEvent
      type: 'event'
    }

export type ConsoleSensorEntry = {
  occurredAt: number
  source: 'console' | 'exception' | 'log'
  stack?: string
  text: string
}

const WorkspaceEventListInputSchema = z.object({
  afterId: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(500).optional(),
  scope: z.string().trim().min(1)
})

const WorkspaceEventSubscribeInputSchema = z.object({
  afterId: z.number().int().nonnegative().optional(),
  scope: z.string().trim().min(1)
})

const ConsoleSensorEntrySchema = z.object({
  occurredAt: z.number().finite().nonnegative(),
  source: z.enum(['console', 'exception', 'log']),
  stack: z
    .string()
    .max(16 * 1_024)
    .optional(),
  text: z
    .string()
    .trim()
    .min(1)
    .max(16 * 1_024)
})

const WorkspaceEventAppendConsoleInputSchema = z.object({
  entries: z.array(ConsoleSensorEntrySchema).min(1).max(100),
  pageUrl: z.string().url().max(8_192),
  projectId: z.string().min(1),
  worktreeId: z.string().min(1)
})

const WorkspaceEventAppendPerformanceInputSchema = z.object({
  artifactId: z.string().uuid(),
  metrics: z
    .record(z.string(), z.number().finite())
    .refine((value) => Object.keys(value).length <= 100),
  pageUrl: z.string().url().max(8_192),
  projectId: z.string().min(1),
  worktreeId: z.string().min(1)
})

export const workspaceEventsContract = {
  appendConsole: withAccess({ scope: 'project', tier: 'control' })
    .input(WorkspaceEventAppendConsoleInputSchema)
    .output(type<{ claimedTerminalHandle: string | null; eventsAppended: number }>()),
  appendPerformance: withAccess({ scope: 'project', tier: 'control' })
    .input(WorkspaceEventAppendPerformanceInputSchema)
    .output(type<{ event: RuntimeWorkspaceEvent }>()),
  list: withAccess({ scope: 'project', tier: 'read' })
    .input(WorkspaceEventListInputSchema)
    .output(type<RuntimeWorkspaceEventListResult>()),
  subscribe: withAccess({ scope: 'project', tier: 'read' })
    .input(WorkspaceEventSubscribeInputSchema)
    .output(eventIterator(type<RuntimeWorkspaceEventSubscriptionEvent>()))
} satisfies ContractRouter<RuntimeProcedureMeta>
