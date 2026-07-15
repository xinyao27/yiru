import { z } from 'zod'
import {
  isSpoolMutationKind,
  type SpoolExecutionOperation
} from '../../shared/spool/spool-operation-contract'
import type { SpoolAccessAuthority } from './spool-access-authority'
import type { SpoolExecutionGateway } from './spool-execution-gateway'
import type { SpoolSessionCatalog } from './spool-session-catalog'
import type { SpoolShareCatalog } from './spool-share-catalog'
import type { SpoolTerminalAttachmentRegistry } from './spool-terminal-attachment-registry'
import { createSpoolCatalogRpcMethods } from './spool-rpc-catalog-registry'
import {
  asWorktreeInvocation,
  createControlStream,
  projectAccessError,
  requestControl,
  type WorktreeInvocation
} from './spool-rpc-control-methods'
import { asSpoolSessionInvocation } from './spool-rpc-session-binding'
import { createSpoolSessionRpcMethods } from './spool-rpc-session-methods'
import {
  createSpoolRpcRegistry,
  SpoolRpcError,
  type BoundSpoolInvocation,
  type SpoolMethodAccess,
  type SpoolRpcInvocationContext,
  type SpoolRpcRegistry
} from './spool-rpc-gateway'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

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
  }).strict()
} as const

export type SpoolRpcRegistryDependencies = {
  catalog: SpoolShareCatalog
  visibility: SpoolWorktreeVisibility
  access: SpoolAccessAuthority
  execution: SpoolExecutionGateway
  sessions: SpoolSessionCatalog
  attachments: SpoolTerminalAttachmentRegistry
}

export function createDefaultSpoolRpcRegistry(
  dependencies: SpoolRpcRegistryDependencies
): SpoolRpcRegistry {
  return createSpoolRpcRegistry([
    ...createSpoolCatalogRpcMethods(dependencies.catalog),
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
    ...createSpoolSessionRpcMethods(dependencies)
  ])
}

export function authorizeSpoolRpcInvocation(
  access: SpoolMethodAccess,
  bound: BoundSpoolInvocation,
  authority: SpoolAccessAuthority,
  connectionId: string
): void {
  if (access === 'catalog-read') {
    return
  }
  const kind = (bound.value as { kind?: unknown }).kind
  const invocation =
    kind === 'live-session' || kind === 'historical-session'
      ? asSpoolSessionInvocation(bound.value)
      : asWorktreeInvocation(bound.value)
  if (!bound.isCurrent()) {
    throw new SpoolRpcError('resource_not_found')
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
  dependencies: SpoolRpcRegistryDependencies,
  params: z.infer<typeof WorktreeParams>,
  context: SpoolRpcInvocationContext
): Promise<BoundSpoolInvocation> {
  const projection = dependencies.catalog.getProjection(context.principal.connectionId)
  const reference = await projection?.resolveWorktree(params.worktreeRef)
  const worktree = reference
    ? await dependencies.visibility.resolvePublicInstance(
        reference.instanceId,
        reference.shareEpoch
      )
    : null
  if (!projection || !reference || !worktree || worktree.worktreeId !== reference.worktreeId) {
    throw new SpoolRpcError('resource_not_found')
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
  operation: SpoolExecutionOperation
  isCurrent: () => boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

function executionMethods(
  dependencies: SpoolRpcRegistryDependencies
): readonly ReturnType<typeof executionMethod>[] {
  return (Object.keys(ExecutionSchemas) as ExecutionMethodName[]).map((name) =>
    executionMethod(name, dependencies)
  )
}

function executionMethod(name: ExecutionMethodName, dependencies: SpoolRpcRegistryDependencies) {
  const mutation = isSpoolMutationKind(name)
  return {
    name,
    schema: ExecutionSchemas[name],
    access: mutation ? ('worktree-control' as const) : ('worktree-read' as const),
    bind: async (params: unknown, context: SpoolRpcInvocationContext) => {
      const parsed = ExecutionSchemas[name].parse(params) as z.infer<typeof WorktreeParams> &
        Record<string, unknown>
      const bound = await bindWorktree(dependencies, parsed, context)
      const invocation = asWorktreeInvocation(bound.value)
      const { worktreeRef: _worktreeRef, ...operationParams } = parsed
      return {
        ...bound,
        value: {
          ...invocation,
          operation: { kind: name, ...operationParams } as SpoolExecutionOperation,
          isCurrent: bound.isCurrent,
          subscribeInvalidation: bound.subscribeInvalidation
        } satisfies ExecutionInvocation
      }
    },
    execute: (value: unknown, context: SpoolRpcInvocationContext) => {
      const invocation = value as ExecutionInvocation
      return dependencies.execution.invoke(
        {
          connectionId: context.principal.connectionId,
          worktree: invocation.worktree,
          isCurrent: invocation.isCurrent,
          subscribeInvalidation: invocation.subscribeInvalidation
        },
        invocation.operation
      )
    },
    project: identityProjector
  }
}

function identityProjector(value: unknown): unknown {
  return value
}
