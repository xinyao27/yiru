import type { RpcClient } from '../transport/rpc-client'
import {
  beginMobileNativeChatSend,
  getMobileNativeChatInputHealingState,
  healMobileNativeChatInput,
  recordMobileNativeChatSendOutcome,
  type MobileNativeChatInputHealingState
} from './mobile-native-chat-input-healing'
import {
  sendMobileNativeChatMessageWithOutcome,
  type MobileNativeChatSendOutcome
} from './mobile-native-chat-send'

type MobileTerminalClient = { id: string; type: 'mobile' }

export async function sendMobileBufferedTerminalInput(args: {
  state?: MobileNativeChatInputHealingState
  client: RpcClient
  terminal: string
  text: string
  deviceToken?: string | null
}): Promise<MobileNativeChatSendOutcome> {
  const state = args.state ?? getMobileNativeChatInputHealingState(args.client)
  const mobileClient: MobileTerminalClient | undefined = args.deviceToken
    ? { id: args.deviceToken, type: 'mobile' }
    : undefined
  const healed = await healMobileNativeChatInput({
    state,
    client: args.client,
    terminal: args.terminal,
    ...(mobileClient ? { mobileClient } : {})
  })
  if (!healed) {
    return 'rejected'
  }

  const sendContext = beginMobileNativeChatSend(state, args.terminal)
  const outcome = await sendMobileNativeChatMessageWithOutcome({
    client: args.client,
    terminal: args.terminal,
    text: args.text,
    ...(mobileClient ? { mobileClient } : {})
  })
  recordMobileNativeChatSendOutcome(state, sendContext, outcome)
  return outcome
}
