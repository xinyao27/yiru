import type { SharedControlLogicalSubscription } from '@yiru/runtime-protocol/workbench/remote-runtime/shared-control-types'

import { remoteRuntimeUnavailableError } from './request-frames'
import {
  finishSharedControlSubscription,
  scheduleSharedControlReconnect
} from './shared-control-state'

export function scheduleSharedControlReconnectOrFinish(args: {
  current: ReturnType<typeof setTimeout> | null
  intentionallyClosed: boolean
  reconnectAttempt: number
  delaysMs: readonly number[]
  subscriptions: Map<string, SharedControlLogicalSubscription<unknown>>
  open: () => void
}): { timer: ReturnType<typeof setTimeout> | null; reconnectAttempt: number } {
  if (args.reconnectAttempt >= args.delaysMs.length) {
    const error = remoteRuntimeUnavailableError('Runtime host connection could not be restored.')
    for (const subscription of Array.from(args.subscriptions.values())) {
      finishSharedControlSubscription(args.subscriptions, subscription, true, error)
    }
    return { timer: null, reconnectAttempt: args.reconnectAttempt }
  }
  return scheduleSharedControlReconnect(args)
}
