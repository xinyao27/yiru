import { ActivityIndicator, Pressable } from 'react-native'

import { ImageSquare as ImagePlus, Microphone as Mic } from '@/components/uniwind-icons'

import { cn } from '../style/class-names'

type DictationState = {
  readonly isStarting: boolean
  readonly isRecording: boolean
  readonly isProcessing: boolean
}

type MobileTerminalInputActionsProps = {
  readonly canSend: boolean
  readonly isAttaching: boolean
  readonly dictation: DictationState
  readonly dictationMode: 'toggle' | 'hold'
  readonly buttonClassName: string
  readonly activeButtonClassName: string
  readonly disabledButtonClassName: string
  readonly onAttachImage: () => void
  readonly onAttachFile: () => void
  readonly onDictationToggle: () => void
  readonly onDictationPressIn: () => void
  readonly onDictationPressOut: () => void
  readonly onDictationCancel: () => void
}

// Image + mic peer actions shared by the live and buffered input bars so both
// surfaces offer identical multimodal entry points (and the JSX lives once).
export function MobileTerminalInputActions({
  canSend,
  isAttaching,
  dictation,
  dictationMode,
  buttonClassName,
  activeButtonClassName,
  disabledButtonClassName,
  onAttachImage,
  onAttachFile,
  onDictationToggle,
  onDictationPressIn,
  onDictationPressOut,
  onDictationCancel
}: MobileTerminalInputActionsProps) {
  const dictationActive = dictation.isStarting || dictation.isRecording
  return (
    <>
      <Pressable
        className={cn(buttonClassName, (!canSend || isAttaching) && disabledButtonClassName)}
        disabled={!canSend || isAttaching}
        // Tap opens the photo library; long-press picks a file. Uploads via host
        // RPC so SSH/remote sessions attach the same as local ones.
        onPress={onAttachImage}
        onLongPress={onAttachFile}
        delayLongPress={350}
        accessibilityLabel={isAttaching ? 'Sending image' : 'Attach a photo'}
        accessibilityHint="Long press to attach a file instead"
      >
        {isAttaching ? (
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        ) : (
          <ImagePlus size={17} colorClassName="accent-muted-foreground" />
        )}
      </Pressable>
      <Pressable
        className={cn(
          buttonClassName,
          dictationActive && activeButtonClassName,
          !canSend && disabledButtonClassName
        )}
        disabled={!canSend}
        onPress={dictationMode === 'toggle' ? onDictationToggle : undefined}
        onPressIn={dictationMode === 'hold' ? onDictationPressIn : undefined}
        onPressOut={dictationMode === 'hold' ? onDictationPressOut : undefined}
        onLongPress={
          dictationMode === 'toggle'
            ? () => {
                if (dictation.isRecording || dictation.isProcessing) {
                  onDictationCancel()
                }
              }
            : undefined
        }
        accessibilityLabel={
          dictation.isRecording
            ? 'Stop voice dictation'
            : dictation.isProcessing
              ? 'Cancel voice dictation'
              : dictation.isStarting
                ? 'Starting voice dictation'
                : 'Start voice dictation'
        }
      >
        {dictation.isProcessing ? (
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        ) : (
          <Mic
            size={17}
            colorClassName={dictationActive ? 'accent-foreground' : 'accent-muted-foreground'}
          />
        )}
      </Pressable>
    </>
  )
}
