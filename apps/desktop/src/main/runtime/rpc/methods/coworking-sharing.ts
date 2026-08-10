import type {
  CoworkingControlDecisionArgs,
  CoworkingHostAccessDecisionArgs,
  CoworkingRequesterInvokeArgs,
  CoworkingRequesterSubscriptionArgs,
  CoworkingRequesterSubscriptionEvent,
  CoworkingSetVisibilityArgs,
  CoworkingSharingSnapshot
} from '@yiru/runtime-protocol/contract'
import { coworkingRequesterTransportError } from '~main/coworking/requester-subscriptions'
import { getCoworkingSharingBinding } from '~main/coworking/sharing'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let coworkingSharingSubscriptionSeq = 0

export function handleCoworkingSharingSnapshot(
  _input: void,
  { runtime }: RpcContext
): CoworkingSharingSnapshot {
  return getCoworkingSharingBinding(runtime).controller.snapshot()
}

export async function handleCoworkingSharingSnapshots(
  _input: void,
  { runtime, connectionId, signal }: RpcContext,
  emit: (snapshot: CoworkingSharingSnapshot) => void
): Promise<void> {
  const ownerConnectionId = requireConnectionId(connectionId)
  await retainCoworkingSharingStream(runtime, ownerConnectionId, signal, () =>
    getCoworkingSharingBinding(runtime).controller.subscribe(emit)
  )
}

export function handleCoworkingSetWorktreeVisibility(
  input: CoworkingSetVisibilityArgs,
  { runtime }: RpcContext
): Promise<void> {
  return getCoworkingSharingBinding(runtime).controller.setWorktreeVisibility({
    worktreeId: input.id,
    visibility: input.visibility
  })
}

export function handleCoworkingSetProjectVisibility(
  input: CoworkingSetVisibilityArgs,
  { runtime }: RpcContext
): Promise<void> {
  return getCoworkingSharingBinding(runtime).controller.setProjectVisibility({
    projectId: input.id,
    visibility: input.visibility
  })
}

export function handleCoworkingRequestControl(
  input: { desktopRef: string; worktreeRef: string },
  { runtime }: RpcContext
): Promise<void> {
  return getCoworkingSharingBinding(runtime).controller.requestControl(input)
}

export function handleCoworkingDecideControl(
  input: CoworkingControlDecisionArgs,
  { runtime }: RpcContext
): Promise<void> {
  return getCoworkingSharingBinding(runtime).controller.decideControl(input)
}

export function handleCoworkingRevokeControl(
  input: { grantId: string },
  { runtime }: RpcContext
): Promise<void> {
  return getCoworkingSharingBinding(runtime).controller.revokeControl(input)
}

export function handleCoworkingRequestHostAccess(
  input: { desktopRef: string },
  { runtime }: RpcContext
) {
  return getCoworkingSharingBinding(runtime).controller.requestHostAccess(input)
}

export function handleCoworkingDecideHostAccess(
  input: CoworkingHostAccessDecisionArgs,
  { runtime }: RpcContext
): Promise<void> {
  return getCoworkingSharingBinding(runtime).controller.decideHostAccess(input)
}

export function handleCoworkingListHostDevices(_input: void, { runtime }: RpcContext) {
  return getCoworkingSharingBinding(runtime).controller.listHostDevices()
}

export function handleCoworkingRevokeHostDevice(
  input: { deviceId: string },
  { runtime }: RpcContext
) {
  return getCoworkingSharingBinding(runtime).controller.revokeHostDevice(input)
}

export function handleCoworkingGetWindowsFirewallStatus(_input: void, { runtime }: RpcContext) {
  return getCoworkingSharingBinding(runtime).controller.getWindowsFirewallStatus()
}

export function handleCoworkingRepairWindowsFirewall(_input: void, { runtime }: RpcContext) {
  return getCoworkingSharingBinding(runtime).controller.repairWindowsFirewall()
}

export function handleCoworkingRetryAvailability(
  _input: void,
  { runtime }: RpcContext
): Promise<void> {
  return getCoworkingSharingBinding(runtime).controller.retryAvailability()
}

export async function handleCoworkingRequesterInvoke(
  input: CoworkingRequesterInvokeArgs,
  { runtime }: RpcContext
): Promise<unknown> {
  try {
    return await getCoworkingSharingBinding(runtime).controller.invokeRequester(input)
  } catch (error) {
    throw coworkingRequesterTransportError(error)
  }
}

export async function handleCoworkingRequesterSubscribe(
  input: CoworkingRequesterSubscriptionArgs,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: CoworkingRequesterSubscriptionEvent) => void
): Promise<void> {
  const ownerConnectionId = requireConnectionId(connectionId)
  await retainCoworkingSharingStream(runtime, ownerConnectionId, signal, (close) => {
    const subscriptions = getCoworkingSharingBinding(runtime).requesterSubscriptions
    try {
      subscriptions.start(ownerConnectionId, input, emit, close)
    } catch (error) {
      close()
      throw coworkingRequesterTransportError(error)
    }
    return () => subscriptions.stop(ownerConnectionId, input.subscriptionId)
  })
}

function requireConnectionId(connectionId: string | undefined): string {
  if (!connectionId) {
    throw new Error('unauthorized')
  }
  return connectionId
}

async function retainCoworkingSharingStream(
  runtime: RpcContext['runtime'],
  connectionId: string,
  signal: AbortSignal | undefined,
  start: (close: () => void) => () => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const subscriptionId = `coworking-sharing-${connectionId}-${++coworkingSharingSubscriptionSeq}`
    let removeAbortListener = (): void => {}
    let stop: (() => void) | null = null
    let closed = false
    let isCleaning = false
    const close = (): void => {
      if (isCleaning) {
        resolve()
        return
      }
      runtime.cleanupSubscription(subscriptionId)
    }
    runtime.registerSubscriptionCleanup(
      subscriptionId,
      () => {
        if (closed) {
          return
        }
        closed = true
        isCleaning = true
        removeAbortListener()
        stop?.()
        resolve()
      },
      connectionId
    )
    removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
    if (closed) {
      return
    }
    try {
      stop = start(close)
    } catch (error) {
      runtime.cleanupSubscription(subscriptionId)
      reject(error)
    }
  })
}
