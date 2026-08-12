import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { getDefaultWorkspaceSession } from '~shared/constants'
import type { WorkspaceSessionPatch, WorkspaceSessionState } from '~shared/types'

import { readWebUIState } from '../../../runtime/web-ui-state'
import { getWebActiveEnvironment } from '../../runtime-connection'
import { readLocalJson, writeLocalJson } from '../../storage/local-json'
import { sanitizeWebRuntimeWorkspaceSession } from '../../workspace-session'

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
