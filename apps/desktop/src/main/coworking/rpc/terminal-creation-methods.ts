import { z } from 'zod'
import { CoworkingAgentLaunchIdSchema } from '~shared/coworking/agent-launch-contract'
import {
  CoworkingTerminalCreateHostResultSchema,
  CoworkingTerminalCreateRequesterResultSchema,
  CoworkingTerminalLaunchOptionsResultSchema
} from '~shared/coworking/execution-result-schema'
import type { CoworkingExecutionOperation } from '~shared/coworking/operation-contract'

import type { CoworkingAccessAuthority } from '../access-authority'
import type { CoworkingExecutionGateway } from '../execution-gateway'
import type { CoworkingLiveSessionDisplayIdentity } from '../live-session-display-identity'
import type { CoworkingResolvedLiveSession } from '../session/catalog'
import type { CoworkingShareCatalog } from '../share-catalog'
import type { CoworkingTerminalAttachmentRegistry } from '../terminal-attachment-registry'
import {
  asWorktreeInvocation,
  projectAccessError,
  type WorktreeInvocation
} from './control-methods'
import {
  CoworkingRpcError,
  type BoundCoworkingInvocation,
  type CoworkingRpcInvocationContext,
  type CoworkingRpcMethodSpec
} from './gateway'

const WorktreeParams = z.object({ worktreeRef: z.string().min(1).max(2_048) }).strict()
const TerminalCreateParams = WorktreeParams.extend({
  clientMutationId: z.string().uuid(),
  launch: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('shell') }).strict(),
    z.object({ kind: z.literal('agent'), agent: CoworkingAgentLaunchIdSchema }).strict()
  ])
}).strict()

type CoworkingTerminalCreationDependencies = {
  access: CoworkingAccessAuthority
  catalog: CoworkingShareCatalog
  execution: CoworkingExecutionGateway
  attachments: CoworkingTerminalAttachmentRegistry
}

type BindWorktree = (
  worktreeRef: string,
  context: CoworkingRpcInvocationContext
) => Promise<BoundCoworkingInvocation>

type TerminalInvocation = WorktreeInvocation & {
  operation: CoworkingExecutionOperation
  isCurrent: () => boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

export function createCoworkingTerminalCreationRpcMethods(
  dependencies: CoworkingTerminalCreationDependencies,
  bindWorktree: BindWorktree
): readonly CoworkingRpcMethodSpec[] {
  return [
    {
      name: 'terminal.launchOptions',
      schema: WorktreeParams,
      access: 'worktree-control',
      bind: async (params, context) =>
        await bindTerminalInvocation(
          bindWorktree,
          WorktreeParams.parse(params),
          { kind: 'terminal.launchOptions' },
          context
        ),
      execute: async (bound, context) => {
        const invocation = asTerminalInvocation(bound)
        const result = await dependencies.execution.invoke(
          executionTarget(invocation, context.principal.connectionId),
          invocation.operation,
          context.signal
        )
        try {
          dependencies.access.requireControl(
            context.principal.connectionId,
            invocation.worktree.instanceId,
            invocation.worktree.shareEpoch
          )
        } catch (error) {
          // Why: launch options are owner inventory disclosed only while the
          // same physical connection still controls this exact worktree.
          throw projectAccessError(error)
        }
        return CoworkingTerminalLaunchOptionsResultSchema.parse(result)
      },
      project: (value) => CoworkingTerminalLaunchOptionsResultSchema.parse(value)
    },
    {
      name: 'terminal.create',
      schema: TerminalCreateParams,
      access: 'worktree-control',
      bind: async (params, context) => {
        const parsed = TerminalCreateParams.parse(params)
        return await bindTerminalInvocation(
          bindWorktree,
          parsed,
          {
            kind: 'terminal.create',
            clientMutationId: parsed.clientMutationId,
            launch: parsed.launch
          },
          context
        )
      },
      execute: async (bound, context) => {
        const invocation = asTerminalInvocation(bound)
        const created = requireCreatedHostResult(
          await dependencies.execution.invoke(
            executionTarget(invocation, context.principal.connectionId),
            invocation.operation,
            context.signal
          )
        )
        if (context.signal.aborted || !invocation.isCurrent()) {
          throw new CoworkingRpcError('outcome_unknown')
        }
        const projection = dependencies.catalog.getProjection(context.principal.connectionId)
        const sessionRef = await projection?.reserveSessionReference(
          invocation.worktree,
          created.sessionKey
        )
        if (!sessionRef || context.signal.aborted || !invocation.isCurrent()) {
          // Why: the process may already exist, so an alias handoff failure is
          // ambiguous and must never invite an automatic second spawn.
          throw new CoworkingRpcError('outcome_unknown')
        }
        const launchAgent =
          invocation.operation.kind === 'terminal.create' &&
          invocation.operation.launch.kind === 'agent'
            ? invocation.operation.launch.agent
            : null
        const displayIdentity: CoworkingLiveSessionDisplayIdentity = launchAgent
          ? { sessionKind: 'agent', agent: launchAgent }
          : { sessionKind: 'terminal', agent: null }
        const attachment: CoworkingResolvedLiveSession = {
          kind: 'live',
          sessionKey: created.sessionKey,
          terminalHandle: created.terminalHandle,
          executionHostId: invocation.worktree.ownerWorktree.executionHostId,
          actualHostScope: invocation.worktree.actualHostScope,
          worktreeInstanceId: invocation.worktree.instanceId,
          coworkingIncarnationId: invocation.worktree.coworkingIncarnationId,
          provider: created.provider,
          providerSessionId: null,
          title: created.title,
          ...displayIdentity
        }
        dependencies.attachments.rememberLive(
          context.principal.connectionId,
          sessionRef,
          invocation.worktree,
          attachment
        )
        return {
          sessionRef,
          session: {
            kind: launchAgent ? 'agent' : 'terminal',
            agent: launchAgent,
            title: created.title
          }
        }
      },
      project: (value) => CoworkingTerminalCreateRequesterResultSchema.parse(value)
    }
  ]
}

async function bindTerminalInvocation(
  bindWorktree: BindWorktree,
  params: z.infer<typeof WorktreeParams>,
  operation: CoworkingExecutionOperation,
  context: CoworkingRpcInvocationContext
): Promise<BoundCoworkingInvocation> {
  const bound = await bindWorktree(params.worktreeRef, context)
  const invocation = asWorktreeInvocation(bound.value)
  return {
    ...bound,
    value: {
      ...invocation,
      operation,
      isCurrent: bound.isCurrent,
      subscribeInvalidation: bound.subscribeInvalidation
    } satisfies TerminalInvocation
  }
}

function asTerminalInvocation(value: unknown): TerminalInvocation {
  const invocation = value as Partial<TerminalInvocation>
  if (!invocation.operation || !invocation.isCurrent) {
    throw new CoworkingRpcError('resource_not_found')
  }
  asWorktreeInvocation(value)
  return invocation as TerminalInvocation
}

function executionTarget(invocation: TerminalInvocation, connectionId: string) {
  return {
    connectionId,
    worktree: invocation.worktree,
    isCurrent: invocation.isCurrent,
    subscribeInvalidation: invocation.subscribeInvalidation
  }
}

function requireCreatedHostResult(
  value: unknown
): z.infer<typeof CoworkingTerminalCreateHostResultSchema> {
  const parsed = CoworkingTerminalCreateHostResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new CoworkingRpcError('outcome_unknown')
  }
  return parsed.data
}
