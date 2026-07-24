import type { RpcClient } from '../transport/rpc-client'
import {
  sendMobileNativeChatMessageWithOutcome,
  type MobileNativeChatSendOutcome
} from './mobile-native-chat-send'

type MobileTerminalClient = { id: string; type: 'mobile' }

export type MobileNativeChatInputHealingState = {
  pastedImageTerminals: Set<string>
  staleInputTerminals: Set<string>
}

export type MobileNativeChatSendContext = {
  terminal: string
  includedPastedImage: boolean
}

const inputHealingStateByClient = new WeakMap<object, MobileNativeChatInputHealingState>()

export function createMobileNativeChatInputHealingState(): MobileNativeChatInputHealingState {
  return { pastedImageTerminals: new Set(), staleInputTerminals: new Set() }
}

export function getMobileNativeChatInputHealingState(
  client: Pick<RpcClient, 'sendRequest'>
): MobileNativeChatInputHealingState {
  const existing = inputHealingStateByClient.get(client)
  if (existing) {
    return existing
  }
  const created = createMobileNativeChatInputHealingState()
  inputHealingStateByClient.set(client, created)
  return created
}

export function markMobileNativeChatImagePasted(
  state: MobileNativeChatInputHealingState,
  terminal: string
): void {
  state.pastedImageTerminals.add(terminal)
}

export function beginMobileNativeChatSend(
  state: MobileNativeChatInputHealingState,
  terminal: string
): MobileNativeChatSendContext {
  return { terminal, includedPastedImage: state.pastedImageTerminals.has(terminal) }
}

export function recordMobileNativeChatSendOutcome(
  state: MobileNativeChatInputHealingState,
  context: MobileNativeChatSendContext,
  outcome: MobileNativeChatSendOutcome
): void {
  if (!context.includedPastedImage) {
    return
  }
  if (outcome === 'accepted') {
    state.pastedImageTerminals.delete(context.terminal)
    state.staleInputTerminals.delete(context.terminal)
    return
  }
  if (outcome === 'unknown') {
    // Why: Enter may have been lost after the path paste reached the PTY; the
    // next send must clear that possible orphan without retrying this message.
    state.pastedImageTerminals.delete(context.terminal)
    state.staleInputTerminals.add(context.terminal)
  }
}

export function recordMobileNativeChatImagePasteOutcome(
  state: MobileNativeChatInputHealingState,
  terminal: string,
  outcome: MobileNativeChatSendOutcome
): void {
  if (outcome === 'accepted') {
    state.staleInputTerminals.delete(terminal)
    state.pastedImageTerminals.add(terminal)
    return
  }
  // Why: both an explicit terminal rejection and ack loss can leave only part
  // of the paste visible; clear conservatively before any later input.
  state.pastedImageTerminals.delete(terminal)
  state.staleInputTerminals.add(terminal)
}

export async function healMobileNativeChatInput(args: {
  state: MobileNativeChatInputHealingState
  client: RpcClient
  terminal: string
  mobileClient?: MobileTerminalClient
}): Promise<boolean> {
  if (!args.state.staleInputTerminals.has(args.terminal)) {
    return true
  }
  const outcome = await sendMobileNativeChatMessageWithOutcome({
    client: args.client,
    terminal: args.terminal,
    text: '\x15',
    enter: false,
    ...(args.mobileClient ? { mobileClient: args.mobileClient } : {})
  })
  if (outcome !== 'accepted') {
    return false
  }
  args.state.staleInputTerminals.delete(args.terminal)
  return true
}
