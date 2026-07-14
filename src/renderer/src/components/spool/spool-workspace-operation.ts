import type { SpoolRequesterTransportErrorCode } from '../../../../shared/spool/spool-ipc-contract'
import { useAppStore } from '@/store'
import {
  resolveSpoolWorkspaceRoute,
  selectSpoolCanControl
} from '@/store/slices/spool-sharing-selectors'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import { getSpoolRequesterTransportErrorCode } from './spool-requester-error'

type SpoolWorkspaceReadMethod =
  | 'files.list'
  | 'files.read'
  | 'files.diff'
  | 'git.status'
  | 'git.diff'
  | 'git.history'

type SpoolWorkspaceMutationMethod =
  | 'files.write'
  | 'files.mkdir'
  | 'files.rename'
  | 'files.delete'
  | 'git.stage'
  | 'git.unstage'
  | 'git.commit'

export class SpoolWorkspaceOperationError extends Error {
  constructor(readonly code: SpoolRequesterTransportErrorCode | 'stale_route') {
    super(code)
    this.name = 'SpoolWorkspaceOperationError'
  }
}

export async function invokeSpoolWorkspaceRead(
  route: SpoolWorkspaceRoute,
  method: SpoolWorkspaceReadMethod,
  params: Record<string, unknown>
): Promise<unknown> {
  requireCurrentRoute(route, false)
  const value = await invokeRequester(route, method, params)
  requireCurrentRoute(route, false)
  return value
}

export async function invokeSpoolWorkspaceMutation(
  route: SpoolWorkspaceRoute,
  method: SpoolWorkspaceMutationMethod,
  params: Record<string, unknown>
): Promise<unknown> {
  // Why: renderer controls are only a convenience; every mutation rechecks the
  // current route and physical-connection grant immediately before IPC.
  requireCurrentRoute(route, true)
  let value: unknown
  try {
    value = await invokeRequester(route, method, params)
  } catch (error) {
    requireNoConflictingActiveRoute(route)
    throw error
  }
  // Why: grant/connection state may change after the owner completed the side
  // effect. Only a different active route makes this result unsafe to apply.
  requireNoConflictingActiveRoute(route)
  return value
}

async function invokeRequester(
  route: SpoolWorkspaceRoute,
  method: SpoolWorkspaceReadMethod | SpoolWorkspaceMutationMethod,
  params: Record<string, unknown>
): Promise<unknown> {
  try {
    return await window.api.spoolSharing.invoke({
      desktopRef: route.desktopRef,
      connectionEpoch: route.connectionEpoch,
      method,
      params: { ...params, worktreeRef: route.worktreeRef }
    })
  } catch (error) {
    const code = getSpoolRequesterTransportErrorCode(error)
    if (code) {
      throw new SpoolWorkspaceOperationError(code)
    }
    throw error
  }
}

function requireNoConflictingActiveRoute(route: SpoolWorkspaceRoute): void {
  const activeRoute = useAppStore.getState().activeSpoolWorkspaceRoute
  if (
    !activeRoute ||
    activeRoute.desktopRef !== route.desktopRef ||
    activeRoute.worktreeRef !== route.worktreeRef ||
    activeRoute.connectionEpoch !== route.connectionEpoch
  ) {
    throw new SpoolWorkspaceOperationError('stale_route')
  }
}

function requireCurrentRoute(route: SpoolWorkspaceRoute, requireControl: boolean): void {
  const state = useAppStore.getState()
  const activeRoute = state.activeSpoolWorkspaceRoute
  if (
    !activeRoute ||
    activeRoute.desktopRef !== route.desktopRef ||
    activeRoute.worktreeRef !== route.worktreeRef ||
    activeRoute.connectionEpoch !== route.connectionEpoch
  ) {
    throw new SpoolWorkspaceOperationError('stale_route')
  }
  const resolved = resolveSpoolWorkspaceRoute(state, route)
  if (!resolved || resolved.desktop.connectionStatus !== 'connected') {
    throw new SpoolWorkspaceOperationError('disconnected')
  }
  if (requireControl && !selectSpoolCanControl(state, route)) {
    throw new SpoolWorkspaceOperationError('unauthorized')
  }
}
