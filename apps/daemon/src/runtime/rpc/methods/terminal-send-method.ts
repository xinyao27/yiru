import type { TerminalSendInput, TerminalSendResult } from '@yiru/runtime-protocol/contract'
import { isTerminalQueryReply } from '@yiru/runtime-protocol/terminal-query-reply'

import { InvalidArgumentError, type RpcContext } from '../core'
import {
  assertTerminalSendExactPtyBinding,
  assertTerminalSendTextWithinLimit,
  commitMobileInputFloor,
  createMobileInputFloorClaimHolder,
  getTerminalSendGuardRefusedReason,
  isTerminalAgentStatusNotWritable,
  isTerminalInputLockedForClient,
  isTerminalSendGuardNotWritable,
  reserveMobileInputFloor,
  resolveMobileFloorClientId,
  rollbackMobileInputFloor
} from './terminal-send-control'
import { updateViewportForClient } from './terminal-viewport-control'

function refusedSend(
  handle: string,
  refusedReason?: 'no-agent' | 'permission'
): TerminalSendResult {
  return {
    send: {
      handle,
      accepted: false,
      bytesWritten: 0,
      ...(refusedReason ? { refusedReason } : {})
    }
  }
}

// Why: `terminal.send` no longer carries a legacy registration — it used to,
// for the same bare-envelope caller documented on `terminalStreamLeaves()` in
// orpc/router-direct/terminal-stream.ts, but slice 110 gave `RpcDispatcher` a
// fallback into that direct wiring for unary bare-envelope callers, so this
// handler is now reached only that way (or by the oRPC router when a caller
// does negotiate).
export async function handleTerminalSend(
  params: TerminalSendInput,
  { runtime, clientId }: RpcContext
): Promise<TerminalSendResult> {
  await assertTerminalSendTextWithinLimit(params.text)
  const queryReplyClientId = clientId ?? params.client?.id
  if (
    params.inputKind === 'query-reply' &&
    (!params.text ||
      !isTerminalQueryReply(params.text) ||
      params.enter === true ||
      params.interrupt === true ||
      params.requireAgentStatus !== undefined ||
      params.client?.type !== 'mobile' ||
      !queryReplyClientId ||
      (clientId !== undefined && params.client.id !== clientId))
  ) {
    throw new InvalidArgumentError('Invalid terminal query reply')
  }

  const leaf = runtime.resolveLiveLeafForHandle(params.terminal)
  const driver = leaf?.ptyId ? runtime.getDriver(leaf.ptyId) : null
  if (
    params.inputKind === 'query-reply' &&
    leaf?.ptyId &&
    !runtime.isMobileTerminalQueryReplyAuthority(leaf.ptyId, queryReplyClientId!)
  ) {
    return refusedSend(params.terminal)
  }
  if (leaf?.ptyId && isTerminalInputLockedForClient(runtime, leaf.ptyId, params.client)) {
    return refusedSend(params.terminal)
  }
  if (
    leaf?.ptyId &&
    params.client?.type === 'desktop' &&
    params.claimViewport === true &&
    params.viewport
  ) {
    const claim = await updateViewportForClient(
      runtime,
      leaf.ptyId,
      `send:${params.client.id}`,
      params.client,
      params.viewport,
      'desktop',
      'refresh',
      true
    )
    if (!claim.updated || isTerminalInputLockedForClient(runtime, leaf.ptyId, params.client)) {
      return refusedSend(params.terminal)
    }
  }

  const hasText = typeof params.text === 'string' && params.text.length > 0
  const hasSuffix = params.enter === true || params.interrupt === true
  if (params.requireAgentStatus === 'sendable' && hasText && hasSuffix) {
    return refusedSend(params.terminal)
  }

  const assertSendPreconditions =
    params.requireAgentStatus === 'sendable'
      ? async (ptyId?: string): Promise<void> => {
          assertTerminalSendExactPtyBinding(runtime, params.terminal, ptyId)
          if (ptyId && isTerminalInputLockedForClient(runtime, ptyId, params.client)) {
            throw new Error('terminal_guard_not_writable')
          }
          let agentStatus
          try {
            agentStatus = await runtime.getTerminalAgentStatus(params.terminal)
          } catch (error) {
            if (isTerminalAgentStatusNotWritable(error)) {
              throw new Error('terminal_guard_not_writable')
            }
            throw error
          }
          assertTerminalSendExactPtyBinding(runtime, params.terminal, ptyId)
          if (!agentStatus.isRunningAgent) {
            throw new Error('terminal_guard_no_agent')
          }
          if (agentStatus.status === 'permission') {
            throw new Error('terminal_guard_permission')
          }
        }
      : undefined

  if (params.requireAgentStatus === 'sendable') {
    try {
      await assertSendPreconditions?.(leaf?.ptyId ?? undefined)
    } catch (error) {
      if (isTerminalSendGuardNotWritable(error)) {
        return refusedSend(params.terminal)
      }
      const refusedReason = getTerminalSendGuardRefusedReason(error)
      if (!refusedReason) {
        throw error
      }
      return refusedSend(params.terminal, refusedReason)
    }
  }

  const mobileFloorClientId = resolveMobileFloorClientId(driver, params.client)
  const mobileFloorClaim = createMobileInputFloorClaimHolder()
  const beforeWrite = assertSendPreconditions
  const reserveWrite =
    params.inputKind !== 'query-reply' && leaf?.ptyId && mobileFloorClientId
      ? (ptyId: string): void => {
          reserveMobileInputFloor(runtime, mobileFloorClaim, ptyId, mobileFloorClientId)
        }
      : undefined
  let result
  try {
    result = await runtime.sendTerminal(
      params.terminal,
      {
        text: params.text,
        enter: params.enter === true,
        interrupt: params.interrupt === true
      },
      {
        beforeWrite,
        ...(reserveWrite ? { reserveWrite } : {}),
        ...(params.inputKind !== 'query-reply' && mobileFloorClientId
          ? { afterWrite: () => commitMobileInputFloor(mobileFloorClaim) }
          : {})
      }
    )
  } catch (error) {
    rollbackMobileInputFloor(mobileFloorClaim)
    const refusedReason = getTerminalSendGuardRefusedReason(error)
    if (refusedReason) {
      return refusedSend(params.terminal, refusedReason)
    }
    if (isTerminalSendGuardNotWritable(error)) {
      return refusedSend(params.terminal)
    }
    throw error
  }
  if (result.accepted !== true) {
    rollbackMobileInputFloor(mobileFloorClaim)
  }
  return { send: result }
}
