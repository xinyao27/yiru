import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import { getDefaultWorkspaceSession } from '@yiru/runtime-protocol/workbench/constants'
import type {
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '@yiru/runtime-protocol/workbench/types'
import { readWebUIState } from '~renderer/runtime/web-ui-state'
import { getWebActiveEnvironment } from '~renderer/web/runtime-connection'
import { readLocalJson, writeLocalJson } from '~renderer/web/storage/local-json'
import { sanitizeWebRuntimeWorkspaceSession } from '~renderer/web/workspace-session'

const SESSION_STORAGE_KEY = 'yiru.web.workspaceSession.v1'

export const webShellSessionApi = {
  get: (hostId?: ExecutionHostId): Promise<WorkspaceSessionState> =>
    Promise.resolve(getStoredWorkspaceSession(hostId)),
  set: async (session: WorkspaceSessionState, hostId?: ExecutionHostId): Promise<void> => {
    writeLocalJson(sessionStorageKeyForHost(hostId), sanitizeWebRuntimeWorkspaceSession(session))
  },
  patch: async (patch: WorkspaceSessionPatch, hostId?: ExecutionHostId): Promise<void> => {
    writeLocalJson(
      sessionStorageKeyForHost(hostId),
      sanitizeWebRuntimeWorkspaceSession({ ...getStoredWorkspaceSession(hostId), ...patch })
    )
  },
  flush: async (): Promise<void> => {}
}

function sessionStorageKeyForHost(hostId?: string | null): string {
  const resolved = normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  return resolved === LOCAL_EXECUTION_HOST_ID
    ? SESSION_STORAGE_KEY
    : `${SESSION_STORAGE_KEY}.${resolved}`
}

function getStoredWorkspaceSession(hostId?: string | null): WorkspaceSessionState {
  const resolvedHostId = normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  if (resolvedHostId !== LOCAL_EXECUTION_HOST_ID) {
    return sanitizeWebRuntimeWorkspaceSession(
      readLocalJson(sessionStorageKeyForHost(resolvedHostId))
    )
  }
  const localSession = sanitizeWebRuntimeWorkspaceSession(readLocalJson(SESSION_STORAGE_KEY))
  if (!getWebActiveEnvironment()) {
    return localSession
  }
  const ui = readWebUIState()
  return sanitizeWebRuntimeWorkspaceSession({
    ...getDefaultWorkspaceSession(),
    activeRepoId: ui.lastActiveRepoId,
    activeWorktreeId: ui.lastActiveWorktreeId,
    lastVisitedAtByWorktreeId: localSession.lastVisitedAtByWorktreeId
  })
}
