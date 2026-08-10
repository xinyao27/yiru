import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

function requiredString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

const OptionalString = z
  .unknown()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

export const AgentTeamsTmuxCompatInputSchema = z.object({
  teamId: requiredString('Missing agent team ID'),
  token: requiredString('Missing agent team token'),
  envPane: requiredString('Missing tmux pane identity'),
  cwd: OptionalString,
  argv: z.array(z.string())
})

export const AgentTeamsPrepareLaunchInputSchema = z.object({
  paneKey: requiredString('Missing pane key'),
  env: z.record(z.string(), z.string()).optional()
})

export type AgentTeamsTmuxCompatInput = z.infer<typeof AgentTeamsTmuxCompatInputSchema>
export type AgentTeamsPrepareLaunchInput = z.infer<typeof AgentTeamsPrepareLaunchInputSchema>

export type AgentTeamsTmuxCompatResult = {
  tmux: { ok: boolean; stdout: string; stderr: string; exitCode: number }
}

export type AgentTeamsPrepareLaunchResult = { launch: { env: Record<string, string> } }

const WORKTREE_CONTROL_ACCESS = { scope: 'worktree', tier: 'control' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const agentTeamsContract = {
  tmuxCompat: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(AgentTeamsTmuxCompatInputSchema)
    .output(type<AgentTeamsTmuxCompatResult>()),
  prepareLaunch: withAccess(WORKTREE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(AgentTeamsPrepareLaunchInputSchema)
    .output(type<AgentTeamsPrepareLaunchResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
