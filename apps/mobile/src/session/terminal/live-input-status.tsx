import { Text, View } from 'react-native'

type MobileTerminalLiveInputStatusProps = {
  readonly isAttaching: boolean
}

export function MobileTerminalLiveInputStatus({ isAttaching }: MobileTerminalLiveInputStatusProps) {
  const detail = isAttaching ? 'Uploading image to host' : 'Tap to show keyboard'

  return (
    <View className="flex-1 gap-px">
      <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
        Live input
      </Text>
      <Text className="text-muted-foreground font-mono text-xs" numberOfLines={1}>
        {detail}
      </Text>
    </View>
  )
}
