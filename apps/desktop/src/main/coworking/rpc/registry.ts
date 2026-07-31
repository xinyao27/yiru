import { z } from 'zod'
import { parseCoworkingExecutionResult } from '~shared/coworking/execution-result-schema'
import {
  isCoworkingMutationKind,
  type CoworkingExecutionOperation
} from '~shared/coworking/operation-contract'

import type { CoworkingAccessAuthority } from '../access-authority'
import type { CoworkingExecutionGateway } from '../execution-gateway'
import type { CoworkingSessionCatalog } from '../session/catalog'
import type { CoworkingShareCatalog } from '../share-catalog'
import type { CoworkingTerminalAttachmentRegistry } from '../terminal-attachment-registry'
import type { CoworkingWorktreeVisibility } from '../worktree-visibility'
import { createCoworkingCatalogRpcMethods } from './catalog-registry'
import {
  asWorktreeInvocation,
  createControlStream,
  projectAccessError,
  requestControl,
  type WorktreeInvocation
} from './control-methods'
import {
  createCoworkingRpcRegistry,
  CoworkingRpcError,
  type BoundCoworkingInvocation,
  type CoworkingMethodAccess,
  type CoworkingRpcInvocationContext,
  type CoworkingRpcRegistry
} from './gateway'
import { asCoworkingSessionInvocation } from './session-binding'
import { createCoworkingSessionRpcMethods } from './session-methods'
import { createCoworkingTerminalCreationRpcMethods } from './terminal-creation-methods'

const WorktreeParams = z.object({ worktreeRef: z.string().min(1).max(2048) }).strict()
const RelativePath = z.string().max(4096)
const BoundedInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const ExecutionSchemas = {
  'files.list': WorktreeParams.extend({
    relativePath: RelativePath,
    limit: z.number().int().positive().max(5_000).optional()
  }).strict(),
  'files.read': WorktreeParams.extend({
    relativePath: RelativePath,
    offset: BoundedInteger.optional(),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024)
      .optional()
  }).strict(),
  'files.diff': WorktreeParams.extend({
    relativePath: RelativePath,
    staged: z.boolean()
  }).strict(),
  'files.write': WorktreeParams.extend({
    relativePath: RelativePath,
    content: z.string().max(6 * 1024 * 1024),
    encoding: z.enum(['utf8', 'base64']),
    mode: z.enum(['create', 'replace'])
  }).strict(),
  'files.mkdir': WorktreeParams.extend({ relativePath: RelativePath }).strict(),
  'files.rename': WorktreeParams.extend({
    relativePath: RelativePath,
    destinationRelativePath: RelativePath
  }).strict(),
  'files.delete': WorktreeParams.extend({
    relativePath: RelativePath,
    recursive: z.boolean().optional()
  }).strict(),
  'git.status': WorktreeParams,
  'git.diff': WorktreeParams.extend({
    source: z.enum(['working-tree', 'index', 'commit']),
    relativePath: RelativePath.optional(),
    commitRef: z.string().min(1).max(2048).optional()
  }).strict(),
  'git.history': WorktreeParams.extend({
    limit: z.number().int().positive().max(200).optional()
  }).strict(),
  'git.stage': WorktreeParams.extend({
    relativePaths: z.array(RelativePath).min(1).max(500)
  }).strict(),
  'git.unstage': WorktreeParams.extend({
    relativePaths: z.array(RelativePath).min(1).max(500)
  }).strict(),
  'git.commit': WorktreeParams.extend({
    message: z
      .string()
      .min(1)
      .max(128 * 1024)
  }).strict(),
  'checks.read': WorktreeParams
} as const

export type CoworkingRpcRegistryDependencies = {
  catalog: CoworkingShareCatalog
  visibility: CoworkingWorktreeVisibility
  access: CoworkingAccessAuthority
  execution: CoworkingExecutionGateway
  sessions: CoworkingSessionCatalog
  attachments: CoworkingTerminalAttachmentRegistry
}

export function createDefaultCoworkingRpcRegistry(
  dependencies: CoworkingRpcRegistryDependencies
): CoworkingRpcRegistry {
  return createCoworkingRpcRegistry([
    ...createCoworkingCatalogRpcMethods(dependencies.catalog),
    {
      name: 'control.request',
      schema: WorktreeParams,
      access: 'worktree-read',
      bind: (params, context) => bindWorktree(dependencies, WorktreeParams.parse(params), context),
      execute: (bound, context) =>
        requestControl(dependencies.access, asWorktreeInvocation(bound), context),
      project: identityProjector
    },
    {
      name: 'control.subscribe',
      schema: WorktreeParams,
      access: 'worktree-read',
      streaming: true,
      bind: (params, context) => bindWorktree(dependencies, WorktreeParams.parse(params), context),
      execute: (bound, context) =>
        createControlStream(dependencies.access, asWorktreeInvocation(bound), context),
      project: identityProjector
    },
    ...executionMethods(dependencies),
    ...createCoworkingTerminalCreationRpcMethods(
      dependencies,
      async (worktreeRef, context) => await bindWorktree(dependencies, { worktreeRef }, context)
    ),
    ...createCoworkingSessionRpcMethods(dependencies)
  ])
}

export function authorizeCoworkingRpcInvocation(
  access: CoworkingMethodAccess,
  bound: BoundCoworkingInvocation,
  authority: CoworkingAccessAuthority,
  connectionId: string
): void {
  if (access === 'catalog-read') {
    return
  }
  const kind = (bound.value as { kind?: unknown }).kind
  const invocation =
    kind === 'live-session' || kind === 'historical-session'
      ? asCoworkingSessionInvocation(bound.value)
      : asWorktreeInvocation(bound.value)
  if (!bound.isCurrent()) {
    throw new CoworkingRpcError('resource_not_found')
  }
  if (access === 'worktree-control') {
    try {
      authority.requireControl(
        connectionId,
        invocation.worktree.instanceId,
        invocation.worktree.shareEpoch
      )
    } catch (error) {
      throw projectAccessError(error)
    }
  }
}

async function bindWorktree(
  dependencies: CoworkingRpcRegistryDependencies,
  params: z.infer<typeof WorktreeParams>,
  context: CoworkingRpcInvocationContext
): Promise<BoundCoworkingInvocation> {
  const projection = dependencies.catalog.getProjection(context.principal.connectionId)
  const reference = await projection?.resolveWorktree(params.worktreeRef)
  const worktree = reference
    ? await dependencies.visibility.resolvePublicInstance(
        reference.instanceId,
        reference.shareEpoch
      )
    : null
  if (!projection || !reference || !worktree || worktree.worktreeId !== reference.worktreeId) {
    throw new CoworkingRpcError('resource_not_found')
  }
  const isCurrent = (): boolean =>
    dependencies.catalog.getProjection(context.principal.connectionId) === projection &&
    dependencies.visibility.isPublic(worktree.instanceId, worktree.shareEpoch)
  return {
    value: {
      kind: 'worktree',
      worktreeRef: params.worktreeRef,
      worktree
    } satisfies WorktreeInvocation,
    isCurrent,
    subscribeInvalidation: (listener) =>
      dependencies.visibility.subscribe((change) => {
        if (change.instanceId === worktree.instanceId) {
          listener()
        }
      })
  }
}

type ExecutionMethodName = keyof typeof ExecutionSchemas

type ExecutionInvocation = WorktreeInvocation & {
  operation: CoworkingExecutionOperation
  isCurrent: () => boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

function executionMethods(
  dependencies: CoworkingRpcRegistryDependencies
): readonly ReturnType<typeof executionMethod>[] {
  return (Object.keys(ExecutionSchemas) as ExecutionMethodName[]).map((name) =>
    executionMethod(name, dependencies)
  )
}

function executionMethod(
  name: ExecutionMethodName,
  dependencies: CoworkingRpcRegistryDependencies
) {
  const mutation = isCoworkingMutationKind(name)
  return {
    name,
    schema: ExecutionSchemas[name],
    access: mutation ? ('worktree-control' as const) : ('worktree-read' as const),
    bind: async (params: unknown, context: CoworkingRpcInvocationContext) => {
      const parsed = ExecutionSchemas[name].parse(params) as z.infer<typeof WorktreeParams> &
        Record<string, unknown>
      const bound = await bindWorktree(dependencies, parsed, context)
      const invocation = asWorktreeInvocation(bound.value)
      const { worktreeRef: _worktreeRef, ...operationParams } = parsed
      return {
        ...bound,
        value: {
          ...invocation,
          operation: { kind: name, ...operationParams } as CoworkingExecutionOperation,
          isCurrent: bound.isCurrent,
          subscribeInvalidation: bound.subscribeInvalidation
        } satisfies ExecutionInvocation
      }
    },
    execute: (value: unknown, context: CoworkingRpcInvocationContext) => {
      const invocation = value as ExecutionInvocation
      return dependencies.execution.invoke(
        {
          connectionId: context.principal.connectionId,
          worktree: invocation.worktree,
          isCurrent: invocation.isCurrent,
          subscribeInvalidation: invocation.subscribeInvalidation
        },
        invocation.operation,
        context.signal
      )
    },
    project: (value: unknown) => projectExecutionResult(name, value)
  }
}

function projectExecutionResult(name: ExecutionMethodName, value: unknown): unknown {
  try {
    return parseCoworkingExecutionResult(name, value)
  } catch {
    // Why: malformed post-admission mutation output cannot prove the side effect did not happen.
    throw new CoworkingRpcError(
      isCoworkingMutationKind(name) ? 'outcome_unknown' : 'internal_error'
    )
  }
}

function identityProjector(value: unknown): unknown {
  return value
}
