import type { SpoolExecutionGateway } from './spool-execution-gateway'
import { SpoolRpcError, type BoundSpoolInvocation } from './spool-rpc-gateway'
import type {
  SpoolResolvedHistoricalSession,
  SpoolResolvedLiveSession,
  SpoolSessionCatalog
} from './spool-session-catalog'
import type { SpoolShareCatalog } from './spool-share-catalog'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import type { SpoolWorktreeVisibility } from './spool-worktree-visibility'

export type SpoolSessionMethodDependencies = {
  catalog: SpoolShareCatalog
  visibility: SpoolWorktreeVisibility
  sessions: SpoolSessionCatalog
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
  const reference = await projection?.resolveSession(sessionRef)
  const worktree = reference
    ? await dependencies.visibility.resolvePublicInstance(
        reference.instanceId,
        reference.shareEpoch
      )
    : null
  const session = worktree
    ? await dependencies.sessions.resolveSession(worktree, reference?.sessionKey ?? '')
    : null
  const current = worktree
    ? await dependencies.visibility.resolvePublicInstance(worktree.instanceId, worktree.shareEpoch)
    : null
  if (
    !projection ||
    !reference ||
    !worktree ||
    !current ||
    current.worktreeId !== worktree.worktreeId ||
    worktree.worktreeId !== reference.worktreeId ||
    session?.kind !== expectedKind
  ) {
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
    worktree: current,
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
