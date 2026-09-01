import type {
  TerminalAutoRestoreFitResult,
  TerminalGetDisplayModeResult,
  TerminalHandleInput,
  TerminalResizeForClientInput,
  TerminalResizeForClientResult,
  TerminalRestoreFitResult,
  TerminalSetAutoRestoreFitInput,
  TerminalSetDisplayModeInput,
  TerminalSetDisplayModeResult,
  TerminalUnsubscribeInput,
  TerminalUnsubscribeResult,
  TerminalUpdateViewportInput,
  TerminalUpdateViewportResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { updateViewportForClient } from './terminal-viewport-control'

export async function handleTerminalResizeForClient(
  params: TerminalResizeForClientInput,
  { runtime }: RpcContext
): Promise<TerminalResizeForClientResult> {
  const leaf = runtime.resolveLiveLeafForHandle(params.terminal)
  if (!leaf?.ptyId) {
    throw new Error('no_connected_pty')
  }
  const result = await runtime.resizeForClient(
    leaf.ptyId,
    params.mode,
    params.clientId,
    params.mode === 'mobile-fit' ? params.cols : undefined,
    params.mode === 'mobile-fit' ? params.rows : undefined
  )
  return { terminal: { handle: params.terminal, ...result } }
}

export async function handleTerminalSetDisplayMode(
  params: TerminalSetDisplayModeInput,
  { runtime }: RpcContext
): Promise<TerminalSetDisplayModeResult> {
  const leaf = runtime.resolveLiveLeafForHandle(params.terminal)
  if (!leaf?.ptyId) {
    throw new Error('no_connected_pty')
  }
  if (params.viewport && params.client?.id) {
    runtime.updateMobileSubscriberViewport(leaf.ptyId, params.client.id, params.viewport)
  }
  if (params.client && params.client.type === 'mobile' && params.mode !== 'desktop') {
    runtime.markMobileActor(leaf.ptyId, params.client.id)
  }
  runtime.setMobileDisplayMode(leaf.ptyId, params.mode)
  await runtime.applyMobileDisplayMode(leaf.ptyId)
  return { mode: params.mode, seq: runtime.getLayout(leaf.ptyId)?.seq }
}

export async function handleTerminalRestoreFit(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalRestoreFitResult> {
  const leaf = runtime.resolveLiveLeafForHandle(params.terminal)
  if (!leaf?.ptyId) {
    throw new Error('no_connected_pty')
  }
  return { restored: await runtime.reclaimTerminalForDesktop(leaf.ptyId) }
}

export async function handleTerminalGetDisplayMode(
  params: TerminalHandleInput,
  { runtime }: RpcContext
): Promise<TerminalGetDisplayModeResult> {
  const leaf = runtime.resolveLeafForHandle(params.terminal)
  const mode = leaf?.ptyId ? runtime.getMobileDisplayMode(leaf.ptyId) : 'auto'
  const isPhoneFitted = leaf?.ptyId ? runtime.isMobileSubscriberActive(leaf.ptyId) : false
  return { mode, isPhoneFitted }
}

// Why: `updateViewport`/`unsubscribe` no longer carry a legacy registration —
// they used to, for the bare-envelope callers documented on
// `terminalViewportLeaves()` in orpc/router-direct/terminal-viewport.ts, but
// slice 110 gave `RpcDispatcher` a fallback into that direct wiring for unary
// bare-envelope callers, so both handlers below are now reached only that way
// (or by the oRPC router when a caller does negotiate).
export async function handleTerminalUpdateViewport(
  params: TerminalUpdateViewportInput,
  { runtime }: RpcContext
): Promise<TerminalUpdateViewportResult> {
  const leaf = runtime.resolveLiveLeafForHandle(params.terminal)
  if (!leaf?.ptyId) {
    throw new Error('no_connected_pty')
  }
  const viewportUpdate = await updateViewportForClient(
    runtime,
    leaf.ptyId,
    `viewport:${params.client.id}`,
    params.client,
    params.viewport,
    'mobile',
    'refresh',
    params.claim === true
  )
  return { ...viewportUpdate, seq: runtime.getLayout(leaf.ptyId)?.seq }
}

export async function handleTerminalUnsubscribe(
  params: TerminalUnsubscribeInput,
  { runtime }: RpcContext
): Promise<TerminalUnsubscribeResult> {
  runtime.cleanupSubscription(params.subscriptionId)
  if (params.client && !params.subscriptionId.includes(':')) {
    runtime.cleanupSubscription(`${params.subscriptionId}:${params.client.id}`)
  }
  return { unsubscribed: true }
}

export async function handleTerminalGetAutoRestoreFit(
  _params: Record<string, never>,
  { runtime }: RpcContext
): Promise<TerminalAutoRestoreFitResult> {
  return { ms: runtime.getMobileAutoRestoreFitMs() }
}

export async function handleTerminalSetAutoRestoreFit(
  params: TerminalSetAutoRestoreFitInput,
  { runtime }: RpcContext
): Promise<TerminalAutoRestoreFitResult> {
  return { ms: runtime.setMobileAutoRestoreFitMs(params.ms) }
}
