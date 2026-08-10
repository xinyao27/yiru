import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  COWORKING_REQUESTER_INVOKE_METHODS,
  COWORKING_REQUESTER_SUBSCRIPTION_METHODS,
  type CoworkingControlDecisionArgs,
  type CoworkingHostAccessDecisionArgs,
  type CoworkingHostDeviceView,
  type CoworkingRequestHostAccessResult,
  type CoworkingRequesterInvokeArgs,
  type CoworkingRequesterSubscriptionArgs,
  type CoworkingRequesterSubscriptionEvent,
  type CoworkingSharingSnapshot,
  type CoworkingWindowsFirewallRepairResult,
  type CoworkingWindowsFirewallStatus
} from './coworking-sharing-types.js'

const LOCAL_SHELL_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local', 'runtime']
} as const
const LOCAL_SHELL_HOST_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local', 'runtime']
} as const

const IdentifierSchema = z.string().min(1).max(2048)
const VisibilitySchema = z.enum(['public', 'private'])
const EmptyInputSchema = z.void()
const ConnectionEpochSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const SubscriptionIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
const OpaqueParamsSchema = z.record(z.string(), z.unknown())

const VisibilityInputSchema = z
  .object({ id: IdentifierSchema, visibility: VisibilitySchema })
  .strict()

const RequestControlInputSchema = z
  .object({ desktopRef: IdentifierSchema, worktreeRef: IdentifierSchema })
  .strict()

const ControlDecisionInputSchema = z
  .object({ requestId: IdentifierSchema, decision: z.enum(['allow', 'deny']) })
  .strict()

const HostAccessDecisionInputSchema = z.discriminatedUnion('decision', [
  z.object({ requestId: IdentifierSchema, decision: z.literal('deny') }).strict(),
  z
    .object({
      requestId: IdentifierSchema,
      decision: z.literal('allow'),
      name: z.string().trim().min(1).max(128),
      tier: z.enum(['read', 'host'])
    })
    .strict()
])

const RequesterInvokeInputSchema = z
  .object({
    desktopRef: IdentifierSchema,
    connectionEpoch: ConnectionEpochSchema,
    method: z.enum(COWORKING_REQUESTER_INVOKE_METHODS),
    params: OpaqueParamsSchema
  })
  .strict()

const RequesterSubscriptionInputSchema = z
  .object({
    subscriptionId: SubscriptionIdSchema,
    desktopRef: IdentifierSchema,
    connectionEpoch: ConnectionEpochSchema,
    method: z.enum(COWORKING_REQUESTER_SUBSCRIPTION_METHODS),
    params: OpaqueParamsSchema
  })
  .strict()

export const coworkingSharingContract = {
  snapshot: withAccess(LOCAL_SHELL_READ_ACCESS)
    .input(EmptyInputSchema)
    .output(type<CoworkingSharingSnapshot>()),
  snapshots: withAccess(LOCAL_SHELL_READ_ACCESS)
    .input(EmptyInputSchema)
    .output(eventIterator(type<CoworkingSharingSnapshot>())),
  setWorktreeVisibility: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(VisibilityInputSchema)
    .output(type<void>()),
  setProjectVisibility: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(VisibilityInputSchema)
    .output(type<void>()),
  requestControl: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(RequestControlInputSchema)
    .output(type<void>()),
  decideControl: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(ControlDecisionInputSchema)
    .output(type<void>()),
  revokeControl: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(z.object({ grantId: IdentifierSchema }).strict())
    .output(type<void>()),
  requestHostAccess: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(z.object({ desktopRef: IdentifierSchema }).strict())
    .output(type<CoworkingRequestHostAccessResult>()),
  decideHostAccess: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(HostAccessDecisionInputSchema)
    .output(type<void>()),
  listHostDevices: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(EmptyInputSchema)
    .output(type<{ devices: readonly CoworkingHostDeviceView[] }>()),
  revokeHostDevice: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(z.object({ deviceId: IdentifierSchema }).strict())
    .output(type<{ revoked: boolean }>()),
  getWindowsFirewallStatus: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(EmptyInputSchema)
    .output(type<CoworkingWindowsFirewallStatus>()),
  repairWindowsFirewall: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(EmptyInputSchema)
    .output(type<CoworkingWindowsFirewallRepairResult>()),
  retryAvailability: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(EmptyInputSchema)
    .output(type<void>()),
  invoke: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(RequesterInvokeInputSchema)
    .output(type<unknown>()),
  subscribeRequester: withAccess(LOCAL_SHELL_HOST_ACCESS)
    .input(RequesterSubscriptionInputSchema)
    .output(eventIterator(type<CoworkingRequesterSubscriptionEvent>()))
} satisfies ContractRouter<RuntimeProcedureMeta>

export type CoworkingSharingControlDecisionInput = CoworkingControlDecisionArgs
export type CoworkingSharingHostAccessDecisionInput = CoworkingHostAccessDecisionArgs
export type CoworkingSharingRequesterInvokeInput = CoworkingRequesterInvokeArgs
export type CoworkingSharingRequesterSubscriptionInput = CoworkingRequesterSubscriptionArgs
