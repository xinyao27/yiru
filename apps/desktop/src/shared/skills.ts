import type { AgentType } from '@yiru/workbench-model/agent'
import { parseExecutionHostId, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'

import type { ProjectExecutionRuntimeResolution } from './project-execution-runtime'

export type SkillProvider = 'codex' | 'claude' | 'agent-skills'

export type SkillSourceKind = 'home' | 'repo' | 'bundled' | 'plugin'

/**
 * How one directory holds a skill.
 *
 * Why it matters to discovery and not only to freshness: `npx skills add
 * --global` writes an independent copy into every agent home, while other
 * installers symlink one directory into all of them. Both look identical in a
 * flat list, and only this distinction says whether editing one edits the rest.
 */
export type SkillInstallationTopology =
  | 'canonical-copy'
  | 'provider-alias'
  | 'independent-copy'
  | 'external-link'
  | 'broken-link'
  | 'read-only'
  | 'repo-scope'
  | 'plugin-cache'
  /** A host that reported the skill without classifying its directory. */
  | 'unknown'

/** One directory holding one skill, as the agent owning that root sees it. */
export type SkillPlacement = {
  /** Stable identity of this directory, independent of scan order. */
  id: string
  rootId: string
  rootPath: string
  rootLabel: string
  /** Agent that owns this root; null is the explicit shared-skills scope. */
  owner: AgentType | null
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  /** The path the agent reads, before any symlink is followed. */
  directoryPath: string
  skillFilePath: string
  /** Where a linked directory actually lives; null when it is a real one. */
  linkTargetPath: string | null
  topology: SkillInstallationTopology
  fileCount: number
  updatedAt: number | null
}

export type DiscoveredSkill = {
  id: string
  name: string
  /** The install directory's own name. `skills add/remove/update` match on this
   *  slug, while `name` may be a frontmatter display name like `React Native`. */
  folderName: string
  description: string | null
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  rootPath: string
  /** Every directory holding this exact skill, within one scope. Grouping keeps
   *  one row per skill, but must not erase co-owning roots, or a copied or
   *  symlinked skill loses the agents that can actually see it. Optional so a
   *  relay whose build predates placements still parses. */
  placements?: SkillPlacement[]
  directoryPath: string
  skillFilePath: string
  installed: boolean
  fileCount: number
  updatedAt: number | null
}

/**
 * Every directory this row covers.
 *
 * Why the fallback: discovery can come from a relay whose build predates
 * placements, and a single-directory row is what that payload actually means.
 */
export function skillPlacements(skill: DiscoveredSkill): SkillPlacement[] {
  if (skill.placements?.length) {
    return skill.placements
  }
  return [
    {
      id: skill.id,
      rootId: skill.rootPath,
      rootPath: skill.rootPath,
      rootLabel: skill.sourceLabel,
      owner: null,
      providers: skill.providers,
      sourceKind: skill.sourceKind,
      sourceLabel: skill.sourceLabel,
      directoryPath: skill.directoryPath,
      skillFilePath: skill.skillFilePath,
      linkTargetPath: null,
      topology: 'unknown',
      fileCount: skill.fileCount,
      updatedAt: skill.updatedAt
    }
  ]
}

/**
 * The name to hand the `skills` CLI for this skill.
 *
 * Why the fallback: discovery can come from a relay whose build predates
 * `folderName`, and the separator is the scanning host's, not this one's.
 */
export function skillDirectoryName(
  skill: Pick<DiscoveredSkill, 'folderName' | 'directoryPath'>
): string {
  if (skill.folderName) {
    return skill.folderName
  }
  const segments = skill.directoryPath.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? skill.directoryPath
}

export type SkillDirectoryEntry = {
  /** Slash-separated and relative to the skill's own directory. */
  relativePath: string
  size: number
}

/** Every file that ships with one skill, SKILL.md first. */
export type SkillDirectoryListing =
  | { ok: true; files: SkillDirectoryEntry[]; truncated: boolean }
  | { ok: false; reason: 'invalid-path' | 'unreadable' | 'unsupported-host' }

/** One file's text, for the preview surface. */
export type SkillFileReadResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; reason: 'invalid-path' | 'unreadable' | 'binary' | 'unsupported-host' }

export type SkillDiscoverySource = {
  id: string
  label: string
  path: string
  sourceKind: SkillSourceKind
  providers: SkillProvider[]
  /** Agent that owns this root; null is the explicit shared-skills scope. */
  owner: AgentType | null
  exists: boolean
  skippedReason?: 'missing' | 'remote-repo'
}

export type SkillDiscoveryResult = {
  skills: DiscoveredSkill[]
  sources: SkillDiscoverySource[]
  scannedAt: number
}

export type SkillDiscoveryTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
  /** Workspace path whose local .agents/.claude skill roots should be scanned. */
  cwd?: string | null
  /** Lets the owning runtime resolve the project runtime from its own store
   *  when the caller (e.g. a remote client) cannot supply `projectRuntime`. */
  worktreeId?: string | null
  /** Explicit pane owner used by the local runtime to delegate direct SSH
   *  discovery to the connected relay instead of scanning local paths. */
  executionHostId?: ExecutionHostId | null
  projectRuntime?: ProjectExecutionRuntimeResolution
}

const ResolvedProjectRuntimeSchema = z.object({
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

const RepairProjectRuntimeSchema = z.object({
  status: z.literal('repair-required'),
  repair: z.object({
    projectId: z.string(),
    preferredRuntime: z.object({ kind: z.literal('wsl'), distro: z.string().nullable() }),
    reason: z.enum(['wsl-unavailable', 'wsl-distro-required', 'wsl-distro-missing']),
    source: z.enum(['project-override', 'global-default']),
    cacheKey: z.string()
  })
})

const ExecutionHostIdSchema = z
  .string()
  .refine((value) => parseExecutionHostId(value) !== null)
  .transform((value) => value as ExecutionHostId)

/** Both desktop IPC and runtime RPC parse the complete discovery target here. */
export const SkillDiscoveryTargetSchema: z.ZodType<SkillDiscoveryTarget> = z.object({
  runtime: z.enum(['host', 'wsl']).optional(),
  wslDistro: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  worktreeId: z.string().nullable().optional(),
  executionHostId: ExecutionHostIdSchema.nullable().optional(),
  projectRuntime: z
    .discriminatedUnion('status', [ResolvedProjectRuntimeSchema, RepairProjectRuntimeSchema])
    .optional()
})

export type SkillFrontmatterSummary = {
  name: string | null
  description: string | null
}
