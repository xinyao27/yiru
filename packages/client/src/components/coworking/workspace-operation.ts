import {
  resolveCoworkingWorkspaceRoute,
  selectCoworkingCanControl
} from '~renderer/components/coworking/selectors'
import { coworkingSharingClient } from '~renderer/runtime/coworking-sharing-client'
import { useAppStore } from '~renderer/store'
import type { CoworkingRequesterTransportErrorCode } from '~shared/coworking/ipc-contract'

import { getCoworkingRequesterTransportErrorCode } from './requester-error'
import type { CoworkingWorktreeRoute } from './worktree-route'

type CoworkingWorkspaceReadMethod =
  | 'files.list'
  | 'files.read'
  | 'files.diff'
  | 'git.status'
  | 'git.diff'
  | 'git.history'
  | 'checks.read'
  | 'terminal.launchOptions'

type CoworkingWorkspaceMutationMethod =
  | 'files.write'
  | 'files.mkdir'
  | 'files.rename'
  | 'files.delete'
  | 'git.stage'
  | 'git.unstage'
  | 'git.commit'
  | 'terminal.create'

export class CoworkingWorkspaceOperationError extends Error {
  readonly code: CoworkingRequesterTransportErrorCode | 'stale_route'

  constructor(code: CoworkingRequesterTransportErrorCode | 'stale_route') {
    super(code)
    this.code = code
    this.name = 'CoworkingWorkspaceOperationError'
  }
}

export async function invokeCoworkingWorkspaceRead(
  route: CoworkingWorktreeRoute,
  method: CoworkingWorkspaceReadMethod,
  params: Record<string, unknown>
): Promise<unknown> {
  // Why: owner agent inventory is disclosed only for the currently granted
  // connection even though fetching it has no side effect.
  const requireControl = method === 'terminal.launchOptions'
  requireCurrentRoute(route, requireControl)
  const value = await invokeRequester(route, method, params)
  requireCurrentRoute(route, requireControl)
  return value
}

export async function invokeCoworkingWorkspaceMutation(
  route: CoworkingWorktreeRoute,
  method: CoworkingWorkspaceMutationMethod,
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
  route: CoworkingWorktreeRoute,
  method: CoworkingWorkspaceReadMethod | CoworkingWorkspaceMutationMethod,
  params: Record<string, unknown>
): Promise<unknown> {
  try {
    return await coworkingSharingClient.invoke({
      desktopRef: route.desktopRef,
      connectionEpoch: route.connectionEpoch,
      method,
      params: { ...params, worktreeRef: route.worktreeRef }
    })
  } catch (error) {
    const code = getCoworkingRequesterTransportErrorCode(error)
    if (code) {
      throw new CoworkingWorkspaceOperationError(code)
    }
    throw error
  }
}

function requireNoConflictingActiveRoute(route: CoworkingWorktreeRoute): void {
  const activeRoute = useAppStore.getState().activeCoworkingWorkspaceRoute
  if (
    !activeRoute ||
    activeRoute.desktopRef !== route.desktopRef ||
    activeRoute.worktreeRef !== route.worktreeRef ||
    activeRoute.connectionEpoch !== route.connectionEpoch
  ) {
    throw new CoworkingWorkspaceOperationError('stale_route')
  }
}

function requireCurrentRoute(route: CoworkingWorktreeRoute, requireControl: boolean): void {
  const state = useAppStore.getState()
  const activeRoute = state.activeCoworkingWorkspaceRoute
  if (
    !activeRoute ||
    activeRoute.desktopRef !== route.desktopRef ||
    activeRoute.worktreeRef !== route.worktreeRef ||
    activeRoute.connectionEpoch !== route.connectionEpoch
  ) {
    throw new CoworkingWorkspaceOperationError('stale_route')
  }
  const resolved = resolveCoworkingWorkspaceRoute(state, route)
  if (!resolved || resolved.desktop.connectionStatus !== 'connected') {
    throw new CoworkingWorkspaceOperationError('disconnected')
  }
  if (requireControl && !selectCoworkingCanControl(state, route)) {
    throw new CoworkingWorkspaceOperationError('unauthorized')
  }
}
