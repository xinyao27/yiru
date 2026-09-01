import type {
  AgentStatusInferInterruptInputSchema,
  AgentStatusPaneKeyInputSchema,
  AgentStatusTabIdInputSchema,
  AgentStatusTransferPaneAuthorityInputSchema
} from '@yiru/runtime-protocol/contract'
import type { AgentInterruptInferenceRequest } from '@yiru/runtime-protocol/workbench/agent/interrupt-intent'
import type { z } from 'zod'
import { createAgentPaneAuthorityOwnership } from '~main/agents/hooks/agent-pane-authority-ownership'
import {
  enrichAgentStatusIpcPayload,
  isValidAgentStatusDropTabId
} from '~main/agents/hooks/agent-status-ipc-boundary'
import {
  clearMigrationUnsupportedPtysByTabPrefix,
  clearMigrationUnsupportedPtysForPaneKey,
  getMigrationUnsupportedPtySnapshot
} from '~main/agents/hooks/migration-unsupported-pty-state'
import { agentHookServer, isValidPaneKey } from '~main/agents/hooks/server'
import { getPtyIdForPaneKey } from '~main/pty/pane-key-registry'

import type { RpcContext, RpcHandler } from '../core'

// Why: pane teardown races are routine, so malformed or already-retired
// identities are ignored instead of turning a best-effort cleanup into a
// visible failure.
const MAX_TRANSFER_PTY_ID_LENGTH = 512

// Why: matches `agentStatus.events.subscribe` — reports hook state, never drives it.
export async function handleAgentStatusGetSnapshot(_params: void, { runtime }: RpcContext) {
  return agentHookServer
    .getStatusSnapshot()
    .map((entry) => enrichAgentStatusIpcPayload(entry, runtime))
}

export async function handleAgentStatusGetMigrationUnsupportedSnapshot() {
  return getMigrationUnsupportedPtySnapshot()
}

// Why: can mark a lead turn interrupted (markClaudeLeadTurnInterrupted/
// markCodexLeadTurnInterrupted) — it drives state, not just reports it.
export const handleAgentStatusInferInterrupt = (async (params) =>
  agentHookServer.inferInterrupt(params as AgentInterruptInferenceRequest)) satisfies RpcHandler<
  z.infer<typeof AgentStatusInferInterruptInputSchema>,
  boolean
>

export const handleAgentStatusDrop = (async ({ paneKey }) => {
  if (!isValidPaneKey(paneKey)) {
    return
  }
  try {
    // Why: dropStatusEntry (not clearPaneState) — the caller is dismissing a
    // status row, not tearing down a PTY.
    agentHookServer.dropStatusEntry(paneKey)
    clearMigrationUnsupportedPtysForPaneKey(paneKey)
  } catch (err) {
    console.warn('[agent-hooks] dropStatusEntry failed:', err)
  }
}) satisfies RpcHandler<z.infer<typeof AgentStatusPaneKeyInputSchema>, void>

export const handleAgentStatusDropByTabPrefix = (async ({ tabId }) => {
  if (!isValidAgentStatusDropTabId(tabId)) {
    return
  }
  try {
    agentHookServer.dropStatusEntriesByTabPrefix(tabId)
    clearMigrationUnsupportedPtysByTabPrefix(tabId)
  } catch (err) {
    console.warn('[agent-hooks] dropStatusEntriesByTabPrefix failed:', err)
  }
}) satisfies RpcHandler<z.infer<typeof AgentStatusTabIdInputSchema>, void>

export const handleAgentStatusRetirePaneAuthority = (async ({ paneKey }) => {
  if (!isValidPaneKey(paneKey)) {
    return
  }
  try {
    agentHookServer.retirePaneAuthority(paneKey)
    clearMigrationUnsupportedPtysForPaneKey(paneKey)
  } catch (err) {
    console.warn('[agent-hooks] retirePaneAuthority failed:', err)
  }
}) satisfies RpcHandler<z.infer<typeof AgentStatusPaneKeyInputSchema>, void>

export const handleAgentStatusTransferPaneAuthority = (async (
  { fromPaneKey, toPaneKey, ptyId }: z.infer<typeof AgentStatusTransferPaneAuthorityInputSchema>,
  { runtime }: RpcContext
) => {
  if (
    !isValidPaneKey(fromPaneKey) ||
    !isValidPaneKey(toPaneKey) ||
    fromPaneKey === toPaneKey ||
    (ptyId !== undefined && (ptyId.length > MAX_TRANSFER_PTY_ID_LENGTH || ptyId.trim() !== ptyId))
  ) {
    return
  }
  const ownsPty = createAgentPaneAuthorityOwnership({
    getPtyIdForPaneKey,
    getRuntimeTerminalHandleForPaneKey: (paneKey) =>
      runtime.getAgentStatusTerminalHandleForPaneKey(paneKey)
  })
  if (!agentHookServer.canTransferPaneAuthority(fromPaneKey, ptyId, ownsPty)) {
    return
  }
  try {
    agentHookServer.transferPaneAuthority(fromPaneKey, toPaneKey, ptyId)
  } catch (err) {
    console.warn('[agent-hooks] transferPaneAuthority failed:', err)
  }
}) satisfies RpcHandler<z.infer<typeof AgentStatusTransferPaneAuthorityInputSchema>, void>
