import { useCallback, useState } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { attachMobileImageToTerminal } from './mobile-image-attachment'
import {
  ImageLibraryPermissionError,
  pickMobileImage,
  type MobileImageSource
} from './mobile-image-source-picker'
import {
  getMobileNativeChatInputHealingState,
  healMobileNativeChatInput,
  recordMobileNativeChatImagePasteOutcome
} from './mobile-native-chat-input-healing'

type CurrentRef<T> = {
  readonly current: T
}

type ShowToast = (message: string, durationMs?: number) => void

type UseMobileImageAttachmentArgs = {
  readonly client: RpcClient | null
  readonly activeHandle: string | null
  readonly canSend: boolean
  readonly connState: ConnectionState
  readonly deviceTokenRef: CurrentRef<string | null>
  readonly getActiveWorktreeConnectionId: () => Promise<string | null>
  readonly showToast: ShowToast
  readonly onSuccess: () => void
  readonly onError: () => void
  readonly beforeTerminalSend?: (terminal: string) => Promise<boolean>
}

type MobileImageAttachment = {
  readonly attachImage: (source: MobileImageSource) => Promise<void>
  // True only while the picked image is uploading to the host (not while the
  // picker is open) — drives the send spinner so the 3-5s transfer isn't a no-op.
  readonly isAttaching: boolean
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useMobileImageAttachment({
  client,
  activeHandle,
  canSend,
  connState,
  deviceTokenRef,
  getActiveWorktreeConnectionId,
  showToast,
  onSuccess,
  onError,
  beforeTerminalSend
}: UseMobileImageAttachmentArgs): MobileImageAttachment {
  const [isAttaching, setIsAttaching] = useState(false)
  const attachImage = useCallback(
    async (source: MobileImageSource): Promise<void> => {
      if (!client || !activeHandle || !canSend) {
        return
      }
      try {
        const inputHealingState = getMobileNativeChatInputHealingState(client)
        const outcome = await attachMobileImageToTerminal(source, {
          client,
          terminal: activeHandle,
          deviceToken: deviceTokenRef.current,
          getConnectionId: getActiveWorktreeConnectionId,
          pickImage: pickMobileImage,
          onUploadStart: () => setIsAttaching(true),
          beforeTerminalSend: async (terminal) => {
            if (beforeTerminalSend && !(await beforeTerminalSend(terminal))) {
              return false
            }
            return healMobileNativeChatInput({
              state: inputHealingState,
              client,
              terminal,
              ...(deviceTokenRef.current
                ? {
                    mobileClient: {
                      id: deviceTokenRef.current,
                      type: 'mobile' as const
                    }
                  }
                : {})
            })
          }
        })
        if (outcome === 'cancelled' || outcome === 'blocked') {
          return
        }
        recordMobileNativeChatImagePasteOutcome(inputHealingState, activeHandle, outcome)
        if (outcome === 'accepted') {
          onSuccess()
          return
        }
        onError()
        showToast(outcome === 'unknown' ? 'Attach delivery unconfirmed' : 'Attach failed', 1500)
      } catch (error) {
        onError()
        if (connState !== 'connected') {
          showToast('Attach failed (disconnected)', 1500)
          return
        }
        if (error instanceof ImageLibraryPermissionError) {
          showToast('Photo permission denied', 1500)
          return
        }
        if (getErrorMessage(error) === 'Clipboard image is too large') {
          showToast('Image too large to attach', 1500)
          return
        }
        showToast('Attach failed', 1500)
      } finally {
        setIsAttaching(false)
      }
    },
    [
      activeHandle,
      beforeTerminalSend,
      canSend,
      client,
      connState,
      deviceTokenRef,
      getActiveWorktreeConnectionId,
      onError,
      onSuccess,
      showToast
    ]
  )

  return { attachImage, isAttaching }
}
