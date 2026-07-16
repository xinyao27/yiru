import type { SpoolRequesterTransportErrorCode } from '../../../../shared/spool/spool-ipc-contract'
import { useAppStore } from '@/store'
import {
  resolveSpoolWorkspaceRoute,
  selectSpoolCanControl
} from '@/store/slices/spool-sharing-selectors'
import { getSpoolRequesterTransportErrorCode } from './spool-requester-error'
import type { SpoolWorktreeRoute } from './spool-worktree-route'

type SpoolWorkspaceReadMethod =
  | 'files.list'
  | 'files.read'
  | 'files.diff'
  | 'git.status'
  | 'git.diff'
  | 'git.history'
  | 'checks.read'
  | 'terminal.launchOptions'

type SpoolWorkspaceMutationMethod =
  | 'files.write'
  | 'files.mkdir'
  | 'files.rename'
  | 'files.delete'
  | 'git.stage'
  | 'git.unstage'
  | 'git.commit'
  | 'terminal.create'

export class SpoolWorkspaceOperationError extends Error {
  constructor(readonly code: SpoolRequesterTransportErrorCode | 'stale_route') {
    super(code)
    this.name = 'SpoolWorkspaceOperationError'
  }
}

export async function invokeSpoolWorkspaceRead(
  route: SpoolWorktreeRoute,
  method: SpoolWorkspaceReadMethod,
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

export async function invokeSpoolWorkspaceMutation(
  route: SpoolWorktreeRoute,
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
  route: SpoolWorktreeRoute,
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

function requireNoConflictingActiveRoute(route: SpoolWorktreeRoute): void {
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

function requireCurrentRoute(route: SpoolWorktreeRoute, requireControl: boolean): void {
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
