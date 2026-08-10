import { type, type ContractRouter } from '@orpc/contract'
import type { AgentType } from '@yiru/workbench-model/agent'
import { parseExecutionHostId, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { skillManageContract } from './skill-manage.js'

export type SkillProvider = 'codex' | 'claude' | 'agent-skills'

export type SkillSourceKind = 'home' | 'repo' | 'bundled' | 'plugin'

export type SkillInstallationTopology =
  | 'canonical-copy'
  | 'provider-alias'
  | 'independent-copy'
  | 'external-link'
  | 'broken-link'
  | 'read-only'
  | 'repo-scope'
  | 'plugin-cache'
  | 'unknown'

export type SkillPlacement = {
  id: string
  rootId: string
  rootPath: string
  rootLabel: string
  owner: AgentType | null
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  directoryPath: string
  skillFilePath: string
  linkTargetPath: string | null
  topology: SkillInstallationTopology
  fileCount: number
  updatedAt: number | null
}

export type DiscoveredSkill = {
  id: string
  name: string
  folderName: string
  description: string | null
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  rootPath: string
  placements?: SkillPlacement[]
  directoryPath: string
  skillFilePath: string
  installed: boolean
  fileCount: number
  updatedAt: number | null
}

export type SkillDiscoverySource = {
  id: string
  label: string
  path: string
  sourceKind: SkillSourceKind
  providers: SkillProvider[]
  owner: AgentType | null
  exists: boolean
  skippedReason?: 'missing' | 'remote-repo'
}

export type SkillDiscoveryResult = {
  skills: DiscoveredSkill[]
  sources: SkillDiscoverySource[]
  scannedAt: number
}

export type ProjectExecutionRuntimeResolution =
  | {
      status: 'resolved'
      runtime:
        | {
            kind: 'local-host'
            hostPlatform: string
            projectId: string
            reason: 'non-windows'
            cacheKey: string
          }
        | {
            kind: 'windows-host'
            hostPlatform: 'win32'
            projectId: string
            reason: 'project-override' | 'global-default' | 'migration-fallback'
            cacheKey: string
          }
        | {
            kind: 'wsl'
            hostPlatform: 'wsl'
            projectId: string
            distro: string
            reason: 'project-override' | 'global-default'
            cacheKey: string
          }
    }
  | {
      status: 'repair-required'
      repair: {
        projectId: string
        preferredRuntime: { kind: 'wsl'; distro: string | null }
        reason: 'wsl-unavailable' | 'wsl-distro-required' | 'wsl-distro-missing'
        source: 'project-override' | 'global-default'
        cacheKey: string
      }
    }

export type SkillDiscoveryTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
  cwd?: string | null
  worktreeId?: string | null
  executionHostId?: ExecutionHostId | null
  projectRuntime?: ProjectExecutionRuntimeResolution
}

export const ResolvedProjectRuntimeSchema = z.object({
  status: z.literal('resolved'),
  runtime: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('local-host'),
      hostPlatform: z.string(),
      projectId: z.string(),
      reason: z.literal('non-windows'),
      cacheKey: z.string()
    }),
    z.object({
      kind: z.literal('windows-host'),
      hostPlatform: z.literal('win32'),
      projectId: z.string(),
      reason: z.enum(['project-override', 'global-default', 'migration-fallback']),
      cacheKey: z.string()
    }),
    z.object({
      kind: z.literal('wsl'),
      hostPlatform: z.literal('wsl'),
      projectId: z.string(),
      distro: z.string(),
      reason: z.enum(['project-override', 'global-default']),
      cacheKey: z.string()
    })
  ])
})

export const RepairProjectRuntimeSchema = z.object({
  status: z.literal('repair-required'),
  repair: z.object({
    projectId: z.string(),
    preferredRuntime: z.object({ kind: z.literal('wsl'), distro: z.string().nullable() }),
    reason: z.enum(['wsl-unavailable', 'wsl-distro-required', 'wsl-distro-missing']),
    source: z.enum(['project-override', 'global-default']),
    cacheKey: z.string()
  })
})

function isExecutionHostId(value: string): value is ExecutionHostId {
  return parseExecutionHostId(value) !== null
}

const ExecutionHostIdSchema = z.string().refine(isExecutionHostId)

export const SkillDiscoverInputSchema = z
  .object({
    runtime: z.enum(['host', 'wsl']).optional(),
    wslDistro: z.string().nullable().optional(),
    cwd: z.string().nullable().optional(),
    worktreeId: z.string().nullable().optional(),
    executionHostId: ExecutionHostIdSchema.nullable().optional(),
    projectRuntime: z
      .discriminatedUnion('status', [ResolvedProjectRuntimeSchema, RepairProjectRuntimeSchema])
      .optional()
  })
  .default({})

export type SkillDiscoverInput = z.output<typeof SkillDiscoverInputSchema>

const SKILLS_ACCESS = { scope: 'host', tier: 'read' } as const

export const skillsContract = {
  discover: withAccess(SKILLS_ACCESS)
    .input(SkillDiscoverInputSchema)
    .output(type<SkillDiscoveryResult>()),
  manage: skillManageContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './skill-manage.js'
