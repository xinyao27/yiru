import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import type { TuiAgent } from '../model/agent.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { ExecutionHostIdSchema } from './host.js'
import { isRuntimeTuiAgent } from './input-schema.js'
import type { AgentPhase } from './terminal-results.js'

export type RuntimeAgentProvider = {
  available: boolean
  executable: string | null
  id: TuiAgent
  label: string
  resumable: boolean
}

export type RuntimeAgentSession = {
  agent: TuiAgent
  completedAt: number | null
  createdAt: number
  id: string
  phase: AgentPhase
  status: 'running' | 'complete' | 'interrupted'
  terminalHandle: string
  title: string | null
  updatedAt: number
  worktreeId: string
}

const AgentSessionListInputSchema = z.object({
  worktreeId: z.string().trim().min(1).optional()
})

const AgentProviderListInputSchema = z.object({ hostId: ExecutionHostIdSchema.optional() })

const TuiAgentSchema = z.custom<TuiAgent>(isRuntimeTuiAgent, { message: 'Unknown agent preset' })

const AgentSessionStartInputSchema = z.object({
  agent: TuiAgentSchema,
  prompt: z.string().max(128_000).optional(),
  title: z.string().trim().min(1).max(256).optional(),
  worktreeId: z.string().trim().min(1)
})

const AgentSessionFollowupInputSchema = z.object({
  prompt: z.string().trim().min(1).max(128_000),
  sessionId: z.string().trim().min(1)
})

const AgentSessionStopInputSchema = z.object({ sessionId: z.string().trim().min(1) })

export type AgentSessionListInput = z.infer<typeof AgentSessionListInputSchema>
export type AgentSessionStartInput = z.infer<typeof AgentSessionStartInputSchema>
export type AgentSessionFollowupInput = z.infer<typeof AgentSessionFollowupInputSchema>
export type AgentSessionStopInput = z.infer<typeof AgentSessionStopInputSchema>

export const agentSessionContract = {
  providers: withAccess({ scope: 'host', tier: 'read' })
    .input(AgentProviderListInputSchema)
    .output(type<{ providers: RuntimeAgentProvider[] }>()),
  list: withAccess({ scope: 'host', tier: 'read' })
    .input(AgentSessionListInputSchema)
    .output(type<{ sessions: RuntimeAgentSession[] }>()),
  start: withAccess({ scope: 'worktree', tier: 'control' })
    .input(AgentSessionStartInputSchema)
    .output(type<{ session: RuntimeAgentSession }>()),
  followup: withAccess({ scope: 'worktree', tier: 'control' })
    .input(AgentSessionFollowupInputSchema)
    .output(type<{ accepted: boolean; session: RuntimeAgentSession }>()),
  stop: withAccess({ scope: 'worktree', tier: 'control' })
    .input(AgentSessionStopInputSchema)
    .output(type<{ session: RuntimeAgentSession }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
