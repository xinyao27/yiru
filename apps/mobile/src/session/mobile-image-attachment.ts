import type { RpcClient } from '../transport/rpc-client'
import {
  buildMobileImagePastePayload,
  saveMobileClipboardImageAsTempFile
} from './mobile-clipboard-image'
import type { MobileImageSource, PickedMobileImage } from './mobile-image-source-picker'
import {
  sendMobileNativeChatMessageWithOutcome,
  type MobileNativeChatSendOutcome
} from './mobile-native-chat-send'

export type AttachMobileImageDeps = {
  readonly client: Pick<RpcClient, 'sendRequest'>
  readonly terminal: string
  readonly deviceToken: string | null
  readonly getConnectionId: () => Promise<string | null>
  // Supplied by the view so this transport module stays free of Expo/native imports.
  readonly pickImage: (source: MobileImageSource) => Promise<PickedMobileImage | null>
  // Fired once the user has picked an image and the host upload is about to
  // start — lets the UI show a sending spinner only for the transfer, not the
  // (potentially long) time the picker is open.
  readonly onUploadStart?: () => void
  readonly beforeTerminalSend?: (terminal: string) => Promise<boolean>
}

export type MobileImageAttachmentOutcome = MobileNativeChatSendOutcome | 'cancelled' | 'blocked'

// Why: use desktop's bracketed-path payload so TUIs attach Mobile uploads the
// same way, while preserving ambiguous delivery for the input-healing caller.
export async function attachMobileImageToTerminal(
  source: MobileImageSource,
  {
    client,
    terminal,
    deviceToken,
    getConnectionId,
    pickImage,
    onUploadStart,
    beforeTerminalSend
  }: AttachMobileImageDeps
): Promise<MobileImageAttachmentOutcome> {
  const picked = await pickImage(source)
  if (!picked) {
    return 'cancelled'
  }
  onUploadStart?.()
  const connectionId = await getConnectionId()
  const imagePath = await saveMobileClipboardImageAsTempFile(client, picked.base64, {
    connectionId
  })
  // Why: a generated image path is terminal image injection, so it's always
  // bracketed (matching desktop paste) regardless of terminal mode.
  const payload = buildMobileImagePastePayload(imagePath)
  if (beforeTerminalSend && !(await beforeTerminalSend(terminal))) {
    return 'blocked'
  }
  return sendMobileNativeChatMessageWithOutcome({
    client,
    terminal,
    text: payload,
    enter: false,
    ...(deviceToken ? { mobileClient: { id: deviceToken, type: 'mobile' as const } } : {})
  })
}
