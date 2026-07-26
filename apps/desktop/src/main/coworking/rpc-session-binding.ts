import type { CoworkingCatalogProjection } from './catalog-projection'
import type { CoworkingExecutionGateway } from './execution-gateway'
import { sameCoworkingOwnerWorktreeSnapshotTarget } from './publication-snapshot-guard'
import { CoworkingRpcError, type BoundCoworkingInvocation } from './rpc-gateway'
import type {
  CoworkingResolvedHistoricalSession,
  CoworkingResolvedLiveSession,
  CoworkingResolvedSession,
  CoworkingSessionCatalog
} from './session-catalog'
import type { CoworkingShareCatalog } from './share-catalog'
import type {
  CoworkingTerminalAttachment,
  CoworkingTerminalAttachmentRegistry
} from './terminal-attachment-registry'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'
import type { CoworkingWorktreeVisibility } from './worktree-visibility'

export type CoworkingSessionMethodDependencies = {
  catalog: CoworkingShareCatalog
  visibility: CoworkingWorktreeVisibility
  sessions: CoworkingSessionCatalog
  attachments: CoworkingTerminalAttachmentRegistry
  execution: CoworkingExecutionGateway
}

type CoworkingSessionInvocationBase = {
  sessionRef: string
  worktree: CoworkingPublicWorktreeInstance
  requestParams: Record<string, unknown>
  isCurrent: () => boolean
  subscribeInvalidation: (listener: () => void) => () => void
}

export type CoworkingLiveSessionInvocation = CoworkingSessionInvocationBase & {
  kind: 'live-session'
  session: CoworkingResolvedLiveSession
}

export type CoworkingHistoricalSessionInvocation = CoworkingSessionInvocationBase & {
  kind: 'historical-session'
  session: CoworkingResolvedHistoricalSession
  ownerRecordKey: string
}

export type CoworkingSessionInvocation =
  | CoworkingLiveSessionInvocation
  | CoworkingHistoricalSessionInvocation

export async function bindCoworkingSession(
  dependencies: CoworkingSessionMethodDependencies,
  connectionId: string,
  sessionRef: string,
  expectedKind: 'live' | 'historical',
  requestParams: Record<string, unknown>
): Promise<BoundCoworkingInvocation> {
  const projection = dependencies.catalog.getProjection(connectionId)
  if (!projection) {
    throw new CoworkingRpcError('resource_not_found')
  }
  if (expectedKind === 'live') {
    const attachment = dependencies.attachments.resolve(connectionId, sessionRef)
    if (attachment) {
      const worktree = await dependencies.visibility.resolvePublicInstance(
        attachment.worktree.instanceId,
        attachment.worktree.shareEpoch
      )
      if (!worktree || !matchesTerminalAttachment(attachment, worktree)) {
        throw new CoworkingRpcError('resource_not_found')
      }
      return bindResolvedCoworkingSession(
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
    throw new CoworkingRpcError('resource_not_found')
  }
  const session = dependencies.sessions.resolveSession(reference.worktree, reference.sessionKey)
  return bindResolvedCoworkingSession(
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

export function bindCoworkingTerminalMutationSession(
  dependencies: CoworkingSessionMethodDependencies,
  connectionId: string,
  sessionRef: string,
  requestParams: Record<string, unknown>
): BoundCoworkingInvocation {
  const projection = dependencies.catalog.getProjection(connectionId)
  if (!projection) {
    throw new CoworkingRpcError('resource_not_found')
  }
  const attachment = dependencies.attachments.resolve(connectionId, sessionRef)
  if (attachment) {
    const worktree = dependencies.visibility.getPublishedInstance(
      attachment.worktree.instanceId,
      attachment.worktree.shareEpoch
    )
    if (!worktree || !matchesTerminalAttachment(attachment, worktree)) {
      throw new CoworkingRpcError('resource_not_found')
    }
    return bindResolvedCoworkingSession(
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
    throw new CoworkingRpcError('resource_not_found')
  }
  const session = dependencies.sessions.resolveSession(reference.worktree, reference.sessionKey)
  return bindResolvedCoworkingSession(
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

function bindResolvedCoworkingSession(
  dependencies: CoworkingSessionMethodDependencies,
  connectionId: string,
  projection: CoworkingCatalogProjection,
  sessionRef: string,
  worktree: CoworkingPublicWorktreeInstance,
  session: CoworkingResolvedSession | null,
  expectedKind: 'live' | 'historical',
  requestParams: Record<string, unknown>
): BoundCoworkingInvocation {
  if (session?.kind !== expectedKind) {
    throw new CoworkingRpcError('resource_not_found')
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
      ? ({ ...base, kind: 'live-session', session } satisfies CoworkingLiveSessionInvocation)
      : historicalInvocation(dependencies.sessions, base, session)
  return { value, isCurrent, subscribeInvalidation }
}

function matchesTerminalAttachment(
  attachment: CoworkingTerminalAttachment,
  worktree: CoworkingPublicWorktreeInstance
): boolean {
  const expected = attachment.worktree
  const session = attachment.session
  return (
    expected.worktreeId === worktree.worktreeId &&
    expected.instanceId === worktree.instanceId &&
    expected.projectId === worktree.projectId &&
    expected.shareEpoch === worktree.shareEpoch &&
    expected.coworkingIncarnationId === worktree.coworkingIncarnationId &&
    expected.actualHostScope === worktree.actualHostScope &&
    sameCoworkingOwnerWorktreeSnapshotTarget(expected.ownerWorktree, worktree.ownerWorktree) &&
    session.worktreeInstanceId === worktree.instanceId &&
    session.coworkingIncarnationId === worktree.coworkingIncarnationId &&
    session.actualHostScope === worktree.actualHostScope &&
    session.executionHostId === worktree.ownerWorktree.executionHostId
  )
}

export function asCoworkingSessionInvocation(value: unknown): CoworkingSessionInvocation {
  const invocation = value as Partial<CoworkingSessionInvocation>
  if (
    (invocation.kind !== 'live-session' && invocation.kind !== 'historical-session') ||
    !invocation.sessionRef ||
    !invocation.worktree ||
    !invocation.session ||
    !invocation.requestParams ||
    !invocation.isCurrent ||
    !invocation.subscribeInvalidation
  ) {
    throw new CoworkingRpcError('resource_not_found')
  }
  return invocation as CoworkingSessionInvocation
}

export function asLiveSessionInvocation(value: unknown): CoworkingLiveSessionInvocation {
  const invocation = asCoworkingSessionInvocation(value)
  if (invocation.kind !== 'live-session' || invocation.session.kind !== 'live') {
    throw new CoworkingRpcError('resource_not_found')
  }
  return invocation
}

export function asHistoricalSessionInvocation(
  value: unknown
): CoworkingHistoricalSessionInvocation {
  const invocation = asCoworkingSessionInvocation(value)
  if (invocation.kind !== 'historical-session' || invocation.session.kind !== 'historical') {
    throw new CoworkingRpcError('resource_not_found')
  }
  return invocation
}

export function coworkingSessionExecutionTarget(
  invocation: CoworkingSessionInvocation,
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
  sessions: CoworkingSessionCatalog,
  base: CoworkingSessionInvocationBase,
  session: CoworkingResolvedHistoricalSession
): CoworkingHistoricalSessionInvocation {
  const record = sessions.resolveHistoricalRecord(session)
  if (!record) {
    throw new CoworkingRpcError('resource_not_found')
  }
  // Why: locator paths and resume commands stay in the owner record store.
  return {
    ...base,
    kind: 'historical-session',
    session,
    ownerRecordKey: record.ownerRecordKey
  }
}
