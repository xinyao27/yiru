import { View } from 'react-native'

import type { MobileImageSource } from '../image-source-picker'
import type { MobileNativeChatController } from './use-controller'
import { MobileNativeChatView, type MobileNativeChatInputLockReason } from './view'

type Props = {
  controller: MobileNativeChatController
  onAttachImage: (source: MobileImageSource) => void
  isAttaching: boolean
  inputLockReason: MobileNativeChatInputLockReason | null
  keyboardInset: number
}

/** Keeps the terminal mounted underneath chat so its PTY subscription survives
 *  view toggles while the native surface owns the visible composer. */
export function MobileNativeChatOverlay({
  controller,
  onAttachImage,
  isAttaching,
  inputLockReason,
  keyboardInset
}: Props): React.JSX.Element | null {
  if (!controller.showNativeChat) {
    return null
  }
  const session = controller.nativeChatSession
  return (
    <View className="absolute inset-0">
      <MobileNativeChatView
        messages={session.messages}
        status={session.status}
        error={session.error}
        agent={controller.nativeChatAgent}
        agentWorking={controller.nativeChatAgentWorking}
        streamingText={controller.nativeChatStreamingText}
        onStop={controller.handleNativeChatStop}
        ask={controller.nativeChatAsk}
        onAnswerAsk={controller.handleNativeChatAnswerAsk}
        onCancelAsk={controller.handleNativeChatCancelAsk}
        question={controller.nativeChatQuestion}
        onAnswerQuestion={controller.handleNativeChatSend}
        permission={controller.nativeChatPermission}
        onRespondPermission={controller.handleNativeChatRespondPermission}
        onOpenFile={controller.handleNativeChatOpenFile}
        hasMore={session.hasMore}
        loadingEarlier={session.loadingEarlier}
        onLoadEarlier={session.loadEarlier}
        onSend={controller.handleNativeChatSend}
        pending={controller.chatPending}
        composerText={controller.chatComposerText}
        onComposerTextChange={controller.setChatComposerText}
        onAttachImage={onAttachImage}
        isAttaching={isAttaching}
        inputLockReason={inputLockReason}
        filePaths={controller.nativeChatFilePaths}
        onNeedFiles={controller.loadNativeChatFiles}
        keyboardInset={keyboardInset}
      />
    </View>
  )
}
