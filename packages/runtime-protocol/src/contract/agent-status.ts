import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import type {
  AgentStatusIpcPayload,
  AgentType,
  MigrationUnsupportedPtyEntry
} from '@yiru/workbench-model/agent'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

// Which agent is running in which pane, and in what state. The shell learns
// this from the agent hook server over IPC; paired clients render the same pane
// badges and titles, so they need the same feed.
export type RuntimeAgentStatusEvent =
  | { type: 'set'; status: AgentStatusIpcPayload }
  | { type: 'clear'; paneKey: string }
  | { type: 'migrationUnsupported'; entry: MigrationUnsupportedPtyEntry }
  | { type: 'migrationUnsupportedClear'; ptyId: string }

// Why: bundles both pull-model snapshots (agentStatus.getSnapshot +
// agentStatus.getMigrationUnsupportedSnapshot) into the one payload the
// subscribe stream replays on `ready`, mirroring `AccountsSnapshot` on
// `accounts.subscribe` — a subscriber that only waits for the stream never
// has a gap between "subscribed" and "knows current state".
export type AgentStatusHostSnapshot = {
  statuses: AgentStatusIpcPayload[]
  migrationUnsupportedPtys: MigrationUnsupportedPtyEntry[]
}

export type RuntimeAgentStatusSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string; snapshot: AgentStatusHostSnapshot }
  | RuntimeAgentStatusEvent
  | { type: 'end' }

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const MOBILE_CLIENT = { mobile: true } as const
// Why: drop/retirePaneAuthority/transferPaneAuthority/inferInterrupt mutate
// the hook server's shared pane-authority bookkeeping (which pane currently
// owns a pty's hook events, and inferred-interrupt turn state) — the part of
// this namespace that drives agent state rather than just reporting it, so
// it needs a write tier. `control`, not `host`: this is ordinary shared
// runtime bookkeeping (same shape as `skillManage`'s ack clearing a shared
// settled-run flag), not a credential/OS-level operation.
const HOST_CONTROL_ACCESS = { scope: 'host', tier: 'control' } as const

export const AgentStatusPaneKeyInputSchema = z.object({
  paneKey: z.string().min(1, 'Missing paneKey')
})

export const AgentStatusTabIdInputSchema = z.object({
  tabId: z.string().min(1, 'Missing tabId')
})

export const AgentStatusTransferPaneAuthorityInputSchema = z.object({
  fromPaneKey: z.string().min(1, 'Missing fromPaneKey'),
  toPaneKey: z.string().min(1, 'Missing toPaneKey'),
  ptyId: z.string().min(1).optional()
})

// Why: mirrors `~shared/agent/interrupt-intent`'s AgentInterruptInferenceRequest.
// That type lives under @yiru/shared, which this lower-level protocol
// package cannot import — the shape is duplicated here as the wire contract,
// The cast below adapts a legacy-shaped field at the wire boundary.
export const AgentStatusInferInterruptInputSchema = z.object({
  paneKey: z.string().min(1, 'Missing paneKey'),
  baselineUpdatedAt: z.number(),
  baselineStateStartedAt: z.number(),
  baselinePrompt: z.string(),
  baselineAgentType: z
    .string()
    .optional()
    .transform((value) => value as AgentType | undefined),
  intent: z.enum(['plain-escape', 'ctrl-c']),
  inputCount: z.number().int().optional()
})

export const agentStatusContract = {
  // Why: the hook server reports for every pane on the machine, so the stream
  // is host-wide. Read tier: it reports agent state, it never drives it.
  events: {
    subscribe: withAccess({ scope: 'host', tier: 'read' }, MOBILE_CLIENT)
      .input(type<void>())
      .output(eventIterator(type<RuntimeAgentStatusSubscriptionEvent>()))
  },
  // Why: kept alongside the subscribe stream's replay (not replaced by it) —
  // same belt-and-suspenders precedent as `accounts.list` beside
  // `accounts.subscribe`'s `ready.snapshot` — for callers that want a single
  // on-demand read without holding a subscription open.
  getSnapshot: withAccess(HOST_READ_ACCESS).input(z.void()).output(type<AgentStatusIpcPayload[]>()),
  getMigrationUnsupportedSnapshot: withAccess(HOST_READ_ACCESS)
    .input(z.void())
    .output(type<MigrationUnsupportedPtyEntry[]>()),
  inferInterrupt: withAccess(HOST_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(AgentStatusInferInterruptInputSchema)
    .output(type<boolean>()),
  drop: withAccess(HOST_CONTROL_ACCESS).input(AgentStatusPaneKeyInputSchema).output(type<void>()),
  dropByTabPrefix: withAccess(HOST_CONTROL_ACCESS)
    .input(AgentStatusTabIdInputSchema)
    .output(type<void>()),
  retirePaneAuthority: withAccess(HOST_CONTROL_ACCESS)
    .input(AgentStatusPaneKeyInputSchema)
    .output(type<void>()),
  transferPaneAuthority: withAccess(HOST_CONTROL_ACCESS)
    .input(AgentStatusTransferPaneAuthorityInputSchema)
    .output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
