import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { RepairProjectRuntimeSchema, ResolvedProjectRuntimeSchema } from './skills.js'

export type PreflightStatus = {
  git: { installed: boolean }
  gh: { installed: boolean; authenticated: boolean }
  glab?: { installed: boolean; authenticated: boolean }
  bitbucket?: { configured: boolean; authenticated: boolean; account: string | null }
  azureDevOps?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
  gitea?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
}

export type ShellHydrationFailureReason =
  | 'none'
  | 'no_shell'
  | 'timeout'
  | 'spawn_error'
  | 'empty_path'

export type PathSource = 'shell_hydrate' | 'sync_seed_only'

export type RefreshAgentsResult = {
  agents: string[]
  addedPathSegments: string[]
  shellHydrationOk: boolean
  pathSource: PathSource
  pathFailureReason: ShellHydrationFailureReason
}

// Why: the desktop preload channel has always carried WSL / project-runtime
// context alongside `force` — preflight probes the runtime the project actually
// executes on, not just the host. The contract has to carry it too, or moving
// the renderer onto this procedure would silently probe the wrong runtime.
export const PreflightCheckInputSchema = z.object({
  force: z.boolean().optional(),
  wslDistro: z.string().nullable().optional(),
  wslDefault: z.boolean().optional(),
  projectRuntime: z
    .discriminatedUnion('status', [ResolvedProjectRuntimeSchema, RepairProjectRuntimeSchema])
    .optional()
})

// Why: agent detection reads the shell PATH of whichever runtime the project
// executes on, so it needs the same WSL / project-runtime context as `check`.
export const PreflightAgentContextInputSchema = z
  .object({
    wslDistro: z.string().nullable().optional(),
    wslDefault: z.boolean().optional(),
    projectRuntime: z
      .discriminatedUnion('status', [ResolvedProjectRuntimeSchema, RepairProjectRuntimeSchema])
      .optional()
  })
  .default({})

export const PreflightDetectRemoteAgentsInputSchema = z.object({
  connectionId: z.string().min(1)
})

export type PreflightCheckInput = z.output<typeof PreflightCheckInputSchema>
export type PreflightAgentContextInput = z.output<typeof PreflightAgentContextInputSchema>
export type PreflightDetectRemoteAgentsInput = z.output<
  typeof PreflightDetectRemoteAgentsInputSchema
>

const PREFLIGHT_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const PREFLIGHT_HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const preflightContract = {
  check: withAccess(PREFLIGHT_READ_ACCESS, MOBILE_CLIENT)
    .input(PreflightCheckInputSchema)
    .output(type<PreflightStatus>()),
  detectAgents: withAccess(PREFLIGHT_READ_ACCESS, MOBILE_CLIENT)
    .input(PreflightAgentContextInputSchema)
    .output(type<string[]>()),
  detectRemoteAgents: withAccess(PREFLIGHT_READ_ACCESS, MOBILE_CLIENT)
    .input(PreflightDetectRemoteAgentsInputSchema)
    .output(type<string[]>()),
  refreshAgents: withAccess(PREFLIGHT_HOST_ACCESS)
    .input(PreflightAgentContextInputSchema)
    .output(type<RefreshAgentsResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
