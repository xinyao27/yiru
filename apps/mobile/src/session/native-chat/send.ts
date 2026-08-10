import type { RpcClient } from '~/transport/rpc-client'
import { isRpcDeliveryUnknown } from '~/transport/rpc-delivery-ambiguity'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'
import { isLogicalClientCutoverError } from '~/transport/stable-logical-rpc-client'

type MobileTerminalClient = {
  id: string
  type: 'mobile'
}

type MobileNativeChatSendArgs = {
  client: Pick<RpcClient, 'orpc'>
  terminal: string
  text: string
  enter?: boolean
  mobileClient?: MobileTerminalClient
}

export type MobileNativeChatSendOutcome = 'accepted' | 'rejected' | 'unknown'

export async function sendMobileNativeChatMessageWithOutcome(
  args: MobileNativeChatSendArgs
): Promise<MobileNativeChatSendOutcome> {
  try {
    const response = await callRuntimeOrpc(args.client, (runtime) => runtime.terminal.send, {
      terminal: args.terminal,
      text: args.text,
      enter: args.enter ?? true,
      ...(args.mobileClient ? { client: args.mobileClient } : {})
    })
    return response.send.accepted ? 'accepted' : 'rejected'
  } catch (error) {
    // Why: a cutover or post-write transport failure may have delivered the
    // input; preserving unknown prevents a retry from duplicating a real send.
    return isRpcDeliveryUnknown(error) || isLogicalClientCutoverError(error)
      ? 'unknown'
      : 'rejected'
  }
}

export async function sendMobileNativeChatMessage(
  args: MobileNativeChatSendArgs
): Promise<boolean> {
  return (await sendMobileNativeChatMessageWithOutcome(args)) === 'accepted'
}
