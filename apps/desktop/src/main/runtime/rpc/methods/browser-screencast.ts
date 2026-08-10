import type {
  BrowserScreencastInput,
  BrowserScreencastResult,
  BrowserScreencastUnsubscribeInput,
  BrowserScreencastUnsubscribeResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export const handleBrowserScreencast = async (
  params: BrowserScreencastInput,
  { browserCommands, connectionId, sendBinary, signal }: RpcContext,
  emit: (event: BrowserScreencastResult) => void
) => browserCommands.browserScreencast(params, { connectionId, sendBinary, signal, emit })

export const handleBrowserScreencastUnsubscribe = (
  params: BrowserScreencastUnsubscribeInput,
  { runtime }: RpcContext
): BrowserScreencastUnsubscribeResult => {
  runtime.cleanupSubscription(params.subscriptionId)
  return { unsubscribed: true }
}
