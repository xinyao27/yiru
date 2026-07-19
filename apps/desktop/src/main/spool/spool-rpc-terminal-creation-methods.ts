import { z } from 'zod'

import { SpoolAgentLaunchIdSchema } from '../../shared/spool/spool-agent-launch-contract'
import {
  SpoolTerminalCreateHostResultSchema,
  SpoolTerminalCreateRequesterResultSchema,
  SpoolTerminalLaunchOptionsResultSchema
} from '../../shared/spool/spool-execution-result-schema'
import type { SpoolExecutionOperation } from '../../shared/spool/spool-operation-contract'
import type { SpoolAccessAuthority } from './spool-access-authority'
import type { SpoolExecutionGateway } from './spool-execution-gateway'
import type { SpoolLiveSessionDisplayIdentity } from './spool-live-session-display-identity'
import {
  asWorktreeInvocation,
  projectAccessError,
  type WorktreeInvocation
} from './spool-rpc-control-methods'
import {
  SpoolRpcError,
  type BoundSpoolInvocation,
  type SpoolRpcInvocationContext,
  type SpoolRpcMethodSpec
} from './spool-rpc-gateway'
import type { SpoolResolvedLiveSession } from './spool-session-catalog'
import type { SpoolShareCatalog } from './spool-share-catalog'
import type { SpoolTerminalAttachmentRegistry } from './spool-terminal-attachment-registry'

const WorktreeParams = z.object({ worktreeRef: z.string().min(1).max(2_048) }).strict()
const TerminalCreateParams = WorktreeParams.extend({
  clientMutationId: z.string().uuid(),
  launch: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('shell') }).strict(),
    z.object({ kind: z.literal('agent'), agent: SpoolAgentLaunchIdSchema }).strict()
  ])
}).strict()

type SpoolTerminalCreationDependencies = {
  access: SpoolAccessAuthority
  catalog: SpoolShareCatalog
  execution: SpoolExecutionGateway
  attachments: SpoolTerminalAttachmentRegistry
}

type BindWorktree = (
  worktreeRef: string,
  context: SpoolRpcInvocationContext
) => Promise<BoundSpoolInvocation>

type TerminalInvocation = WorktreeInvocation & {
  operation: SpoolExecutionOperation
  isCurrent: () => boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

export function createSpoolTerminalCreationRpcMethods(
  dependencies: SpoolTerminalCreationDependencies,
  bindWorktree: BindWorktree
): readonly SpoolRpcMethodSpec[] {
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
        return SpoolTerminalLaunchOptionsResultSchema.parse(result)
      },
      project: (value) => SpoolTerminalLaunchOptionsResultSchema.parse(value)
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
          throw new SpoolRpcError('outcome_unknown')
        }
        const projection = dependencies.catalog.getProjection(context.principal.connectionId)
        const sessionRef = await projection?.reserveSessionReference(
          invocation.worktree,
          created.sessionKey
        )
        if (!sessionRef || context.signal.aborted || !invocation.isCurrent()) {
          // Why: the process may already exist, so an alias handoff failure is
          // ambiguous and must never invite an automatic second spawn.
          throw new SpoolRpcError('outcome_unknown')
        }
        const launchAgent =
          invocation.operation.kind === 'terminal.create' &&
          invocation.operation.launch.kind === 'agent'
            ? invocation.operation.launch.agent
            : null
        const displayIdentity: SpoolLiveSessionDisplayIdentity = launchAgent
          ? { sessionKind: 'agent', agent: launchAgent }
          : { sessionKind: 'terminal', agent: null }
        const attachment: SpoolResolvedLiveSession = {
          kind: 'live',
          sessionKey: created.sessionKey,
          terminalHandle: created.terminalHandle,
          executionHostId: invocation.worktree.ownerWorktree.executionHostId,
          actualHostScope: invocation.worktree.actualHostScope,
          worktreeInstanceId: invocation.worktree.instanceId,
          spoolIncarnationId: invocation.worktree.spoolIncarnationId,
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
      project: (value) => SpoolTerminalCreateRequesterResultSchema.parse(value)
    }
  ]
}

async function bindTerminalInvocation(
  bindWorktree: BindWorktree,
  params: z.infer<typeof WorktreeParams>,
  operation: SpoolExecutionOperation,
  context: SpoolRpcInvocationContext
): Promise<BoundSpoolInvocation> {
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
    throw new SpoolRpcError('resource_not_found')
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
): z.infer<typeof SpoolTerminalCreateHostResultSchema> {
  const parsed = SpoolTerminalCreateHostResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new SpoolRpcError('outcome_unknown')
  }
  return parsed.data
}
