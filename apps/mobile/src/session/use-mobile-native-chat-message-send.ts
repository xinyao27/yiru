import { useCallback, type MutableRefObject } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import {
  beginMobileNativeChatSend,
  healMobileNativeChatInput,
  recordMobileNativeChatSendOutcome,
  type MobileNativeChatInputHealingState
} from './mobile-native-chat-input-healing'
import { sendMobileNativeChatMessageWithOutcome } from './mobile-native-chat-send'
import type { MobileNativeChatSendOrigin } from './use-mobile-native-chat-drafts'

type Args = {
  client: RpcClient | null
  activeHandleRef: MutableRefObject<string | null>
  deviceTokenRef: MutableRefObject<string | null>
  inputHealingState: MobileNativeChatInputHealingState
  inputLeaseReady: boolean
  captureSendOrigin: (text: string) => MobileNativeChatSendOrigin | null
  acceptSend: (origin: MobileNativeChatSendOrigin, text: string) => void
  holdUnconfirmedSend: (
    origin: MobileNativeChatSendOrigin,
    text: string,
    onUnconfirmed: () => void
  ) => void
  onSendError: (message: string) => void
}

export function useMobileNativeChatMessageSend({
  client,
  activeHandleRef,
  deviceTokenRef,
  inputHealingState,
  inputLeaseReady,
  captureSendOrigin,
  acceptSend,
  holdUnconfirmedSend,
  onSendError
}: Args): (text: string) => Promise<boolean> {
  return useCallback(
    async (text: string): Promise<boolean> => {
      const handle = activeHandleRef.current
      const origin = captureSendOrigin(text)
      if (!client || !handle || !origin || !inputLeaseReady) {
        onSendError('Message not sent (disconnected)')
        return false
      }
      const mobileClient = deviceTokenRef.current
        ? { id: deviceTokenRef.current, type: 'mobile' as const }
        : undefined
      const healed = await healMobileNativeChatInput({
        state: inputHealingState,
        client,
        terminal: handle,
        ...(mobileClient ? { mobileClient } : {})
      })
      if (!healed || activeHandleRef.current !== handle) {
        onSendError('Message not sent')
        return false
      }
      const sendContext = beginMobileNativeChatSend(inputHealingState, handle)
      const outcome = await sendMobileNativeChatMessageWithOutcome({
        client,
        terminal: handle,
        text,
        ...(mobileClient ? { mobileClient } : {})
      })
      recordMobileNativeChatSendOutcome(inputHealingState, sendContext, outcome)
      if (outcome === 'unknown') {
        // Why: retrying an ack-lost send can duplicate a delivered prompt; hold
        // the draft for transcript reconciliation without adding a permanent echo.
        holdUnconfirmedSend(origin, text, () =>
          onSendError('Delivery unconfirmed — check chat before retrying')
        )
        return true
      }
      if (outcome === 'rejected') {
        onSendError('Message not sent')
        return false
      }
      acceptSend(origin, text)
      return true
    },
    [
      acceptSend,
      activeHandleRef,
      captureSendOrigin,
      client,
      deviceTokenRef,
      holdUnconfirmedSend,
      inputHealingState,
      inputLeaseReady,
      onSendError
    ]
  )
}
