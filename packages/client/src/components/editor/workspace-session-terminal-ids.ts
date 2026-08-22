import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import {
  getDurableTerminalSessionId,
  rememberTerminalSessionId
} from '~renderer/runtime/terminal-session-id-index'
import { parseRuntimeTerminalPtyId } from '~shared/runtime-terminal-pty-id'
import type { WorkspaceSessionState } from '~shared/types'
import {
  exchangeWorkspaceSessionTerminalIds,
  hasExchangeableWorkspaceSessionTerminalIds,
  replaceWorkspaceSessionTerminalIds,
  type WorkspaceSessionTerminalIdFields
} from '~shared/workspace/session-terminal-ids'

const TERMINAL_ID_EXCHANGE_LIMIT = 10_000

function targetForSessionHost(hostId: ExecutionHostId): RuntimeClientTarget {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsed.environmentId }
    : { kind: 'local' }
}

export async function exchangePersistedWorkspaceSessionTerminalIds(
  session: WorkspaceSessionState,
  hostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): Promise<WorkspaceSessionState> {
  if (!hasExchangeableWorkspaceSessionTerminalIds(session)) {
    return session
  }
  const target = targetForSessionHost(hostId)
  const listed = await callRuntimeOrpc(
    target,
    (client) => client.terminal.list,
    { limit: TERMINAL_ID_EXCHANGE_LIMIT, requireFreshPtyLiveness: true },
    { timeoutMs: 15_000 }
  )
  if (listed.truncated) {
    throw new Error('workspace_session_terminal_list_truncated')
  }
  const environmentId = target.kind === 'environment' ? target.environmentId : null
  for (const terminal of listed.terminals) {
    if (terminal.connected && terminal.ptyId) {
      rememberTerminalSessionId(terminal.handle, terminal.ptyId, environmentId)
    }
  }
  const exchanged = exchangeWorkspaceSessionTerminalIds(session, listed.terminals, environmentId)
  console.info(
    `[session] exchanged ${exchanged.exchangedIdCount} terminal ids; retired ${exchanged.retiredIdCount} stale ids`
  )
  return exchanged.session
}

function persistedTerminalId(ptyId: string): string | null {
  return parseRuntimeTerminalPtyId(ptyId) ? getDurableTerminalSessionId(ptyId) : ptyId
}

export function prepareWorkspaceSessionTerminalIdsForPersistence(
  fields: WorkspaceSessionTerminalIdFields
): WorkspaceSessionTerminalIdFields {
  return replaceWorkspaceSessionTerminalIds(fields, persistedTerminalId)
}
