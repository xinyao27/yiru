import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'

import type { WorkspaceSessionState } from '../../shared/types'
import { parseWorkspaceSession } from '../../shared/workspace-session-schema'

export type PersistedStateCodecWarning = {
  code: 'corrupt-workspace-session' | 'corrupt-host-workspace-session'
  hostId?: ExecutionHostId
  detail: string
}

export type PersistedWorkspaceSessionsDecodeResult = {
  workspaceSession: WorkspaceSessionState
  workspaceSessionsByHostId: Partial<Record<ExecutionHostId, WorkspaceSessionState>>
  warnings: PersistedStateCodecWarning[]
}

export function decodePersistedWorkspaceSessions(
  workspaceSessionValue: unknown,
  hostSessionsValue: unknown,
  defaults: WorkspaceSessionState
): PersistedWorkspaceSessionsDecodeResult {
  const warnings: PersistedStateCodecWarning[] = []
  const workspaceSession = (() => {
    if (workspaceSessionValue === undefined) {
      return defaults
    }
    const parsedLocal = parseWorkspaceSession(workspaceSessionValue)
    if (parsedLocal.ok) {
      return { ...defaults, ...parsedLocal.value }
    }
    warnings.push({
      code: 'corrupt-workspace-session',
      detail: parsedLocal.error
    })
    return defaults
  })()

  const workspaceSessionsByHostId: Partial<Record<ExecutionHostId, WorkspaceSessionState>> = {}
  if (
    hostSessionsValue &&
    typeof hostSessionsValue === 'object' &&
    !Array.isArray(hostSessionsValue)
  ) {
    for (const [key, value] of Object.entries(hostSessionsValue as Record<string, unknown>)) {
      const hostId = normalizeExecutionHostId(key)
      if (!hostId || hostId === LOCAL_EXECUTION_HOST_ID) {
        continue
      }
      const parsed = parseWorkspaceSession(value)
      if (parsed.ok) {
        workspaceSessionsByHostId[hostId] = { ...defaults, ...parsed.value }
      } else {
        warnings.push({
          code: 'corrupt-host-workspace-session',
          hostId,
          detail: parsed.error
        })
      }
    }
  }

  return { workspaceSession, workspaceSessionsByHostId, warnings }
}
