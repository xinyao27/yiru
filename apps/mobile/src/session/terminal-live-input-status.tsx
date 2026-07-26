import { Text, View } from 'react-native'

import { cn } from '@/style/class-names'

type DictationStatus = {
  readonly isStarting: boolean
  readonly isRecording: boolean
  readonly isProcessing: boolean
}

type MobileTerminalLiveInputStatusProps = {
  readonly dictation: DictationStatus
  readonly isAttaching: boolean
}

export function MobileTerminalLiveInputStatus({
  dictation,
  isAttaching
}: MobileTerminalLiveInputStatusProps) {
  const title = dictation.isRecording
    ? 'Listening'
    : dictation.isProcessing
      ? 'Processing'
      : dictation.isStarting
        ? 'Starting mic'
        : 'Live input'
  const detail = dictation.isRecording
    ? 'Tap mic to stop'
    : dictation.isProcessing
      ? 'Transcribing on desktop'
      : dictation.isStarting
        ? 'Preparing microphone'
        : isAttaching
          ? 'Uploading image to host'
          : 'Tap to show keyboard'

  return (
    <View className={styles.status}>
      <Text className={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text className={styles.detail} numberOfLines={1}>
        {detail}
      </Text>
    </View>
  )
}

const styles = {
  status: cn('flex-1 gap-[1px]'),
  title: cn('text-foreground text-[12px] font-semibold'),
  detail: cn('text-muted-foreground text-[12px] font-mono')
} as const
