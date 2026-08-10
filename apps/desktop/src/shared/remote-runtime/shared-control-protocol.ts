import {
  decodeRuntimeOrpcBinaryFrame,
  decodeRuntimeOrpcSideChannelBinaryFrame,
  decodeRuntimeOrpcTextFrame,
  encodeRuntimeOrpcBinaryFrame,
  encodeRuntimeOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'
import type WebSocket from 'ws'

import { decrypt, decryptBytes, encrypt, encryptBytes } from '../e2ee-crypto'
import { RemoteRuntimeClientError } from './client'
import { invalidRemoteRuntimeResponseError, parseRemoteRuntimeRpcFrame } from './request-frames'
import type {
  SharedControlConnectionState,
  SharedControlLogicalSubscription
} from './shared-control-types'

export function parseSharedControlFrame(
  frame: string,
  sharedKey: Uint8Array | null,
  state: SharedControlConnectionState
):
  | { type: 'auth'; plaintext: string }
  | {
      type: 'frame'
      frame: Exclude<ReturnType<typeof parseRemoteRuntimeRpcFrame>, { type: 'error' }>
    }
  | { type: 'orpc'; frame: string }
  | { type: 'error'; error: RemoteRuntimeClientError } {
  if (!sharedKey) {
    return {
      type: 'error',
      error: invalidRemoteRuntimeResponseError('Runtime host returned a frame before E2EE.')
    }
  }
  const plaintext = decrypt(frame, sharedKey)
  if (plaintext === null) {
    return {
      type: 'error',
      error: invalidRemoteRuntimeResponseError('Runtime host returned an undecryptable frame.')
    }
  }
  if (state === 'awaiting_authenticated') {
    return { type: 'auth', plaintext }
  }
  const orpcFrame = decodeRuntimeOrpcTextFrame(plaintext)
  if (orpcFrame !== null) {
    return { type: 'orpc', frame: orpcFrame }
  }
  const parsed = parseRemoteRuntimeRpcFrame(plaintext)
  if (parsed.type === 'error') {
    return parsed
  }
  return { type: 'frame', frame: parsed }
}

export function parseSharedControlBinaryFrame(
  frame: Uint8Array<ArrayBufferLike>,
  sharedKey: Uint8Array | null,
  state: SharedControlConnectionState
):
  | { type: 'orpc'; frame: Uint8Array<ArrayBufferLike> }
  | {
      type: 'orpc-side-channel'
      requestId: string
      frame: Uint8Array<ArrayBufferLike>
    }
  | { type: 'error'; error: RemoteRuntimeClientError } {
  if (!sharedKey || state !== 'ready') {
    return {
      type: 'error',
      error: invalidRemoteRuntimeResponseError(
        'Runtime host returned binary data before shared control was ready.'
      )
    }
  }
  const plaintext = decryptBytes(frame, sharedKey)
  const orpcFrame = plaintext ? decodeRuntimeOrpcBinaryFrame(plaintext) : null
  if (orpcFrame) {
    return { type: 'orpc', frame: orpcFrame }
  }
  const sideChannel = plaintext ? decodeRuntimeOrpcSideChannelBinaryFrame(plaintext) : null
  if (!sideChannel) {
    return {
      type: 'error',
      error: invalidRemoteRuntimeResponseError(
        'Runtime host returned an invalid encrypted oRPC binary frame.'
      )
    }
  }
  return {
    type: 'orpc-side-channel',
    requestId: sideChannel.requestId,
    frame: sideChannel.payload
  }
}

export function getSubscriptionId(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const value = (result as { subscriptionId?: unknown }).subscriptionId
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function isEndResult(result: unknown): boolean {
  return (
    typeof result === 'object' && result !== null && (result as { type?: unknown }).type === 'end'
  )
}

export function getCleanupRequest(
  subscription: SharedControlLogicalSubscription<unknown>
): { method: string; params: unknown } | null {
  if (subscription.method === 'accounts.subscribe' && subscription.remoteSubscriptionId) {
    return cleanupBySubscriptionId('accounts.unsubscribe', subscription.remoteSubscriptionId)
  }
  if (subscription.method === 'notifications.subscribe' && subscription.remoteSubscriptionId) {
    return cleanupBySubscriptionId('notifications.unsubscribe', subscription.remoteSubscriptionId)
  }
  if (
    subscription.method === 'runtime.clientEvents.subscribe' &&
    subscription.remoteSubscriptionId
  ) {
    return cleanupBySubscriptionId(
      'runtime.clientEvents.unsubscribe',
      subscription.remoteSubscriptionId
    )
  }
  if (subscription.method === 'files.watch' && subscription.remoteSubscriptionId) {
    return cleanupBySubscriptionId('files.unwatch', subscription.remoteSubscriptionId)
  }
  if (subscription.method === 'session.tabs.subscribe') {
    const params =
      typeof subscription.params === 'object' && subscription.params !== null
        ? { ...subscription.params, subscriptionId: subscription.requestId }
        : subscription.params
    return { method: 'session.tabs.unsubscribe', params }
  }
  if (subscription.method === 'session.tabs.subscribeAll') {
    return {
      method: 'session.tabs.unsubscribeAll',
      params: { subscriptionId: subscription.requestId }
    }
  }
  if (subscription.method === 'coworking.host.subscribeTerminal') {
    return {
      method: 'terminal.unsubscribe',
      params: { subscriptionId: `coworking.host.terminal:${subscription.requestId}` }
    }
  }
  if (subscription.method === 'coworking.host.subscribeSessionChanges') {
    return {
      method: 'coworking.host.unsubscribeSessionChanges',
      params: { requestId: subscription.requestId }
    }
  }
  return null
}

export function formatSharedControlCloseMessage(code: number, reason: Buffer): string {
  const reasonText = reason.toString().trim()
  if (code !== 1005 && code !== 1006 && reasonText) {
    return `Runtime host closed the connection (${code}: ${reasonText}).`
  }
  if (code !== 1005 && code !== 1006) {
    return `Runtime host closed the connection (${code}).`
  }
  return 'Runtime host closed the connection.'
}

export function sendSharedControlEncrypted(args: {
  state: SharedControlConnectionState
  ws: WebSocket | null
  sharedKey: Uint8Array | null
  payload: unknown
}): boolean {
  if (args.state !== 'ready' && args.state !== 'awaiting_authenticated') {
    return false
  }
  if (!args.ws || args.ws.readyState !== 1 || !args.sharedKey) {
    return false
  }
  args.ws.send(encrypt(JSON.stringify(args.payload), args.sharedKey))
  return true
}

export function sendSharedControlOrpcText(args: {
  state: SharedControlConnectionState
  ws: WebSocket | null
  sharedKey: Uint8Array | null
  frame: string
}): boolean {
  if (!isSharedControlWritable(args)) {
    return false
  }
  args.ws.send(encrypt(encodeRuntimeOrpcTextFrame(args.frame), args.sharedKey))
  return true
}

export function sendSharedControlOrpcBinary(args: {
  state: SharedControlConnectionState
  ws: WebSocket | null
  sharedKey: Uint8Array | null
  frame: Uint8Array<ArrayBufferLike>
}): boolean {
  if (!isSharedControlWritable(args)) {
    return false
  }
  const plaintext = encodeRuntimeOrpcBinaryFrame(args.frame)
  args.ws.send(Buffer.from(encryptBytes(plaintext, args.sharedKey)), { binary: true })
  return true
}

export function toRemoteRuntimeClientError(error: unknown): RemoteRuntimeClientError {
  if (error instanceof RemoteRuntimeClientError) {
    return error
  }
  if (error instanceof Error) {
    return new RemoteRuntimeClientError('runtime_error', error.message)
  }
  return new RemoteRuntimeClientError('runtime_error', String(error))
}

function cleanupBySubscriptionId(
  method: string,
  subscriptionId: string
): { method: string; params: unknown } {
  return { method, params: { subscriptionId } }
}

function isSharedControlWritable(args: {
  state: SharedControlConnectionState
  ws: WebSocket | null
  sharedKey: Uint8Array | null
}): args is {
  state: 'ready'
  ws: WebSocket
  sharedKey: Uint8Array
} {
  return args.state === 'ready' && args.ws?.readyState === 1 && args.sharedKey !== null
}
