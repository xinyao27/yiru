import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { SkillInstallationTopology, SkillProvider, SkillSourceKind } from './skills.js'

// Why: `skills.discover` only scans; installing, updating, and removing a skill
// writes into a specific machine's agent homes, and tracking a live CLI run is
// a second host-scoped concern layered on top. Both belong under `skills`
// (this is the same feature as `discover`, not the bundled-skill-guides
// domain that name collision might suggest) but earn their own `manage`
// sub-namespace so the file stays under the line budget and the two concerns
// stay greppable apart.

export type SkillManageScope = { kind: 'global' } | { kind: 'project'; repoPath: string }

export type SkillUpdateFailure =
  | { kind: 'unsafe-command-path'; command: string }
  | { kind: 'launch-failed'; detail: string }
  | { kind: 'command-exited'; exitCode: number | null }
  | { kind: 'incomplete' }

type SkillRunSubject = {
  operation: 'update' | 'install' | 'remove'
  names: string[]
  source?: string
}

export type SkillUpdateRun =
  | { state: 'idle' }
  | ({ state: 'running'; startedAt: number; output: string; stopping?: boolean } & SkillRunSubject)
  | ({ state: 'success'; finishedAt: number; output: string } & SkillRunSubject)
  | ({
      state: 'error'
      finishedAt: number
      output: string
      failedNames: string[]
    } & SkillRunSubject &
      SkillUpdateFailure)

export type SkillUpdateStartResult =
  | { started: true }
  | {
      started: false
      reason:
        | 'already-running'
        | 'invalid-names'
        | 'invalid-source'
        | 'invalid-scope'
        | 'unsafe-command-path'
    }

export type SkillDirectoryEntry = { relativePath: string; size: number }

export type SkillDirectoryListing =
  | { ok: true; files: SkillDirectoryEntry[]; truncated: boolean }
  | { ok: false; reason: 'invalid-path' | 'unreadable' | 'unsupported-host' }

export type SkillFileReadResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; reason: 'invalid-path' | 'unreadable' | 'binary' | 'unsupported-host' }

export type SkillFreshnessStatus =
  | 'current'
  | 'outdated'
  | 'newer-known'
  | 'unrecognized'
  | 'inaccessible'

export type SkillFreshnessInstallation = {
  id: string
  name: string
  rootId: string
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  unresolvedPath: string
  resolvedPath: string | null
  physicalIdentity: string | null
  topology: SkillInstallationTopology
  status: SkillFreshnessStatus
  installedReleaseRevision: number | null
  installedAppVersion: string | null
  currentReleaseRevision: number
  currentPackageDigest: string
  currentAppVersion: string
  observedPackageDigest: string | null
  observedGitTreeSha?: string | null
  errorCategory: string | null
}

export type SkillFreshnessInventory = {
  schemaVersion: 1
  installations: SkillFreshnessInstallation[]
  eligibleUpdateNames: string[]
  scannedAt: number
}

export type RuntimeSkillUpdateRunEvent = { type: 'run'; run: SkillUpdateRun }

export type RuntimeSkillUpdateRunSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeSkillUpdateRunEvent
  | { type: 'end' }

const SkillManageScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global') }),
  z.object({ kind: z.literal('project'), repoPath: z.string().min(1) })
])

export const SkillManageNamesInputSchema = z.object({ names: z.array(z.string()) })
export type SkillManageNamesInput = z.output<typeof SkillManageNamesInputSchema>

export const SkillManageInstallInputSchema = z.object({
  source: z.string().min(1),
  skillNames: z.array(z.string()).optional(),
  scope: SkillManageScopeSchema
})
export type SkillManageInstallInput = z.output<typeof SkillManageInstallInputSchema>

export const SkillManageRemoveInputSchema = z.object({
  names: z.array(z.string()),
  scope: SkillManageScopeSchema
})
export type SkillManageRemoveInput = z.output<typeof SkillManageRemoveInputSchema>

export const SkillManageDirectoryInputSchema = z.object({ directoryPath: z.string().min(1) })
export type SkillManageDirectoryInput = z.output<typeof SkillManageDirectoryInputSchema>

export const SkillManageFileInputSchema = z.object({
  directoryPath: z.string().min(1),
  relativePath: z.string().min(1)
})
export type SkillManageFileInput = z.output<typeof SkillManageFileInputSchema>

const SKILL_MANAGE_READ_ACCESS = { scope: 'host', tier: 'read' } as const
// Why: install/update/remove spawn `npx skills` against a machine's agent
// homes — a host write, not merely a scoped control action.
const SKILL_MANAGE_HOST_ACCESS = { scope: 'host', tier: 'host' } as const
// Why: acknowledging only clears the shared runner's settled-run flag in
// memory; it writes no file and kills nothing, so it sits below the `host`
// tier that cancel and the start verbs need (mirrors
// `orchestration.federationAck`).
const SKILL_MANAGE_ACK_ACCESS = { scope: 'host', tier: 'control' } as const

export const skillManageContract = {
  freshnessInventory: withAccess(SKILL_MANAGE_READ_ACCESS).output(type<SkillFreshnessInventory>()),
  startUpdateRun: withAccess(SKILL_MANAGE_HOST_ACCESS)
    .input(SkillManageNamesInputSchema)
    .output(type<SkillUpdateStartResult>()),
  startInstallRun: withAccess(SKILL_MANAGE_HOST_ACCESS)
    .input(SkillManageInstallInputSchema)
    .output(type<SkillUpdateStartResult>()),
  startRemoveRun: withAccess(SKILL_MANAGE_HOST_ACCESS)
    .input(SkillManageRemoveInputSchema)
    .output(type<SkillUpdateStartResult>()),
  listSkillFiles: withAccess(SKILL_MANAGE_READ_ACCESS)
    .input(SkillManageDirectoryInputSchema)
    .output(type<SkillDirectoryListing>()),
  readSkillDirFile: withAccess(SKILL_MANAGE_READ_ACCESS)
    .input(SkillManageFileInputSchema)
    .output(type<SkillFileReadResult>()),
  // Why: cancel and acknowledge return the settled run so a client sees the
  // outcome immediately instead of racing the push event.
  cancelUpdateRun: withAccess(SKILL_MANAGE_HOST_ACCESS).output(type<SkillUpdateRun>()),
  acknowledgeUpdateRun: withAccess(SKILL_MANAGE_ACK_ACCESS).output(type<SkillUpdateRun>()),
  getUpdateRun: withAccess(SKILL_MANAGE_READ_ACCESS).output(type<SkillUpdateRun>()),
  // Why: one run at a time, one subscription shape — same reasoning as
  // `speech.events.subscribe`: reports the shared runner's state, never
  // drives it, so subscription count should scale with clients, not verbs.
  events: {
    subscribe: withAccess(SKILL_MANAGE_READ_ACCESS)
      .input(type<void>())
      .output(eventIterator(type<RuntimeSkillUpdateRunSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>
