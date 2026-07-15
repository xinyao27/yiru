import type { SpoolExecutionGateway } from './spool-execution-gateway'
import type { SpoolCatalogProjection } from './spool-catalog-projection'
import { SpoolRpcError, type BoundSpoolInvocation } from './spool-rpc-gateway'
import type {
  SpoolResolvedHistoricalSession,
  SpoolResolvedLiveSession,
  SpoolResolvedSession,
  SpoolSessionCatalog
} from './spool-session-catalog'
import type { SpoolShareCatalog } from './spool-share-catalog'
import type {
  SpoolTerminalAttachment,
  SpoolTerminalAttachmentRegistry
} from './spool-terminal-attachment-registry'
import { sameSpoolOwnerWorktreeSnapshotTarget } from './spool-publication-snapshot-guard'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

export type SpoolSessionMethodDependencies = {
  catalog: SpoolShareCatalog
  visibility: SpoolWorktreeVisibility
  sessions: SpoolSessionCatalog
  attachments: SpoolTerminalAttachmentRegistry
  execution: SpoolExecutionGateway
}

type SpoolSessionInvocationBase = {
  sessionRef: string
  worktree: SpoolPublicWorktreeInstance
  requestParams: Record<string, unknown>
  isCurrent: () => boolean
  subscribeInvalidation: (listener: () => void) => () => void
}

export type SpoolLiveSessionInvocation = SpoolSessionInvocationBase & {
  kind: 'live-session'
  session: SpoolResolvedLiveSession
}

export type SpoolHistoricalSessionInvocation = SpoolSessionInvocationBase & {
  kind: 'historical-session'
  session: SpoolResolvedHistoricalSession
  ownerRecordKey: string
}

export type SpoolSessionInvocation = SpoolLiveSessionInvocation | SpoolHistoricalSessionInvocation

export async function bindSpoolSession(
  dependencies: SpoolSessionMethodDependencies,
  connectionId: string,
  sessionRef: string,
  expectedKind: 'live' | 'historical',
  requestParams: Record<string, unknown>
): Promise<BoundSpoolInvocation> {
  const projection = dependencies.catalog.getProjection(connectionId)
  if (!projection) {
    throw new SpoolRpcError('resource_not_found')
  }
  if (expectedKind === 'live') {
    const attachment = dependencies.attachments.resolve(connectionId, sessionRef)
    if (attachment) {
      const worktree = await dependencies.visibility.resolvePublicInstance(
        attachment.worktree.instanceId,
        attachment.worktree.shareEpoch
      )
      if (!worktree || !matchesTerminalAttachment(attachment, worktree)) {
        throw new SpoolRpcError('resource_not_found')
      }
      return bindResolvedSpoolSession(
        dependencies,
        connectionId,
        projection,
        sessionRef,
        worktree,
        attachment.session,
        expectedKind,
        requestParams
      )
    }
  }
  const reference = await projection.resolveSession(sessionRef)
  if (!reference) {
    throw new SpoolRpcError('resource_not_found')
  }
  const session = dependencies.sessions.resolveSession(reference.worktree, reference.sessionKey)
  return bindResolvedSpoolSession(
    dependencies,
    connectionId,
    projection,
    sessionRef,
    reference.worktree,
    session,
    expectedKind,
    requestParams
  )
}

export function bindSpoolTerminalMutationSession(
  dependencies: SpoolSessionMethodDependencies,
  connectionId: string,
  sessionRef: string,
  requestParams: Record<string, unknown>
): BoundSpoolInvocation {
  const projection = dependencies.catalog.getProjection(connectionId)
  if (!projection) {
    throw new SpoolRpcError('resource_not_found')
  }
  const attachment = dependencies.attachments.resolve(connectionId, sessionRef)
  if (attachment) {
    const worktree = dependencies.visibility.getPublishedInstance(
      attachment.worktree.instanceId,
      attachment.worktree.shareEpoch
    )
    if (!worktree || !matchesTerminalAttachment(attachment, worktree)) {
      throw new SpoolRpcError('resource_not_found')
    }
    return bindResolvedSpoolSession(
      dependencies,
      connectionId,
      projection,
      sessionRef,
      worktree,
      attachment.session,
      'live',
      requestParams
    )
  }
  const reference = projection.resolvePublishedSession(sessionRef)
  if (!reference) {
    throw new SpoolRpcError('resource_not_found')
  }
  const session = dependencies.sessions.resolveSession(reference.worktree, reference.sessionKey)
  return bindResolvedSpoolSession(
    dependencies,
    connectionId,
    projection,
    sessionRef,
    reference.worktree,
    session,
    'live',
    requestParams
  )
}

function bindResolvedSpoolSession(
  dependencies: SpoolSessionMethodDependencies,
  connectionId: string,
  projection: SpoolCatalogProjection,
  sessionRef: string,
  worktree: SpoolPublicWorktreeInstance,
  session: SpoolResolvedSession | null,
  expectedKind: 'live' | 'historical',
  requestParams: Record<string, unknown>
): BoundSpoolInvocation {
  if (session?.kind !== expectedKind) {
    throw new SpoolRpcError('resource_not_found')
  }
  const isCurrent = (): boolean =>
    dependencies.catalog.getProjection(connectionId) === projection &&
    dependencies.visibility.isPublic(worktree.instanceId, worktree.shareEpoch)
  const subscribeInvalidation = (listener: () => void): (() => void) =>
    dependencies.visibility.subscribe((change) => {
      if (change.instanceId === worktree.instanceId) {
        listener()
      }
    })
  const base = {
    sessionRef,
    worktree,
    requestParams,
    isCurrent,
    subscribeInvalidation
  }
  const value =
    session.kind === 'live'
      ? ({ ...base, kind: 'live-session', session } satisfies SpoolLiveSessionInvocation)
      : historicalInvocation(dependencies.sessions, base, session)
  return { value, isCurrent, subscribeInvalidation }
}

function matchesTerminalAttachment(
  attachment: SpoolTerminalAttachment,
  worktree: SpoolPublicWorktreeInstance
): boolean {
  const expected = attachment.worktree
  const session = attachment.session
  return (
    expected.worktreeId === worktree.worktreeId &&
    expected.instanceId === worktree.instanceId &&
    expected.projectId === worktree.projectId &&
    expected.shareEpoch === worktree.shareEpoch &&
    expected.spoolIncarnationId === worktree.spoolIncarnationId &&
    expected.actualHostScope === worktree.actualHostScope &&
    sameSpoolOwnerWorktreeSnapshotTarget(expected.ownerWorktree, worktree.ownerWorktree) &&
    session.worktreeInstanceId === worktree.instanceId &&
    session.spoolIncarnationId === worktree.spoolIncarnationId &&
    session.actualHostScope === worktree.actualHostScope &&
    session.executionHostId === worktree.ownerWorktree.executionHostId
  )
}

export function asSpoolSessionInvocation(value: unknown): SpoolSessionInvocation {
  const invocation = value as Partial<SpoolSessionInvocation>
  if (
    (invocation.kind !== 'live-session' && invocation.kind !== 'historical-session') ||
    !invocation.sessionRef ||
    !invocation.worktree ||
    !invocation.session ||
    !invocation.requestParams ||
    !invocation.isCurrent ||
    !invocation.subscribeInvalidation
  ) {
    throw new SpoolRpcError('resource_not_found')
  }
  return invocation as SpoolSessionInvocation
}

export function asLiveSessionInvocation(value: unknown): SpoolLiveSessionInvocation {
  const invocation = asSpoolSessionInvocation(value)
  if (invocation.kind !== 'live-session' || invocation.session.kind !== 'live') {
    throw new SpoolRpcError('resource_not_found')
  }
  return invocation
}

export function asHistoricalSessionInvocation(value: unknown): SpoolHistoricalSessionInvocation {
  const invocation = asSpoolSessionInvocation(value)
  if (invocation.kind !== 'historical-session' || invocation.session.kind !== 'historical') {
    throw new SpoolRpcError('resource_not_found')
  }
  return invocation
}

export function spoolSessionExecutionTarget(
  invocation: SpoolSessionInvocation,
  connectionId: string
) {
  return {
    connectionId,
    worktree: invocation.worktree,
    isCurrent: invocation.isCurrent,
    subscribeInvalidation: invocation.subscribeInvalidation
  }
}

function historicalInvocation(
  sessions: SpoolSessionCatalog,
  base: SpoolSessionInvocationBase,
  session: SpoolResolvedHistoricalSession
): SpoolHistoricalSessionInvocation {
  const record = sessions.resolveHistoricalRecord(session)
  if (!record) {
    throw new SpoolRpcError('resource_not_found')
  }
  // Why: locator paths and resume commands stay in the owner record store.
  return {
    ...base,
    kind: 'historical-session',
    session,
    ownerRecordKey: record.ownerRecordKey
  }
}
