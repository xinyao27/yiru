import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import type { WorkspaceSessionState } from '~shared/types'
import {
  hasLegacyWorkspaceSessionTerminalIds,
  reconcileWorkspaceSessionTerminalIds
} from '~shared/workspace/session-terminal-ids'

const TERMINAL_ID_RECONCILIATION_LIMIT = 10_000

function targetForSessionHost(hostId: ExecutionHostId): RuntimeClientTarget {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsed.environmentId }
    : { kind: 'local' }
}

export async function canonicalizeWorkspaceSessionTerminalIds(
  session: WorkspaceSessionState,
  hostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): Promise<WorkspaceSessionState> {
  if (!hasLegacyWorkspaceSessionTerminalIds(session)) {
    return session
  }
  const target = targetForSessionHost(hostId)
  const listed = await callRuntimeOrpc(
    target,
    (client) => client.terminal.list,
    { limit: TERMINAL_ID_RECONCILIATION_LIMIT, requireFreshPtyLiveness: true },
    { timeoutMs: 15_000 }
  )
  if (listed.truncated) {
    throw new Error('workspace_session_terminal_list_truncated')
  }
  const environmentId = target.kind === 'environment' ? target.environmentId : null
  const reconciled = reconcileWorkspaceSessionTerminalIds(session, listed.terminals, environmentId)
  console.info(
    `[session] canonicalized ${reconciled.migratedIdCount} legacy terminal ids; retired ${reconciled.retiredIdCount} stale ids`
  )
  return reconciled.session
}
