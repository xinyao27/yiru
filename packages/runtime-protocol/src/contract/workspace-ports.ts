import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { OptionalString, requiredNumber } from './input-schema.js'

export type RuntimeWorkspacePortOwner = {
  worktreeId: string
  repoId: string
  displayName: string
  path: string
  confidence: 'cwd' | 'command' | 'none'
}

type RuntimeWorkspacePortBase = {
  id: string
  bindHost: string
  connectHost: string
  port: number
  pid?: number
  processName?: string
  protocol: 'http' | 'https' | 'unknown'
}

export type RuntimeWorkspacePort =
  | (RuntimeWorkspacePortBase & {
      kind: 'workspace'
      owner: RuntimeWorkspacePortOwner
      advertisedUrl?: string
    })
  | (RuntimeWorkspacePortBase & { kind: 'container' })
  | (RuntimeWorkspacePortBase & { kind: 'external' })

export type RuntimeWorkspacePortScanResult = {
  platform:
    | 'aix'
    | 'android'
    | 'darwin'
    | 'freebsd'
    | 'haiku'
    | 'linux'
    | 'openbsd'
    | 'sunos'
    | 'win32'
    | 'cygwin'
    | 'netbsd'
    | 'unknown'
  scannedAt: number
  ports: RuntimeWorkspacePort[]
  unavailableReason?: string
}

export type RuntimeWorkspacePortKillResult = { ok: true } | { ok: false; reason: string }

// Why: the desktop renderer's own listener only wires up for `kind === 'local'`
// today (local runtime event push, always same-machine) — remote environments fall
// back to the 30s poll in `workspace-port-scanner.tsx`. This stream lets
// paired clients get the same push the local shell already has instead of
// waiting out the poll interval.
export type RuntimeWorkspacePortAdvertisedUrlChangedEvent = {
  type: 'advertisedUrlChanged'
  worktreeId: string
  port: number
}

export type RuntimeWorkspacePortSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeWorkspacePortAdvertisedUrlChangedEvent
  | { type: 'end' }

export const WorkspacePortScanInputSchema = z.object({ repoId: OptionalString })

export const WorkspacePortKillInputSchema = z.object({
  repoId: OptionalString,
  pid: requiredNumber('Missing process id'),
  port: requiredNumber('Missing port')
})

export type WorkspacePortScanInput = z.output<typeof WorkspacePortScanInputSchema>
export type WorkspacePortKillInput = z.output<typeof WorkspacePortKillInputSchema>

const WORKSPACE_PORT_ACCESS = { scope: 'host', tier: 'host' } as const

export const workspacePortsContract = {
  scan: withAccess(WORKSPACE_PORT_ACCESS)
    .input(WorkspacePortScanInputSchema)
    .output(type<RuntimeWorkspacePortScanResult>()),
  kill: withAccess(WORKSPACE_PORT_ACCESS)
    .input(WorkspacePortKillInputSchema)
    .output(type<RuntimeWorkspacePortKillResult>()),
  // Why: reports state, never drives it — same reasoning as
  // `agentStatus.events`, so tier is `read` rather than
  // `WORKSPACE_PORT_ACCESS`'s `host` (that tier covers `scan`/`kill`, which
  // enumerate/signal host processes).
  events: {
    subscribe: withAccess({ scope: 'host', tier: 'read' })
      .input(type<void>())
      .output(eventIterator(type<RuntimeWorkspacePortSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>
