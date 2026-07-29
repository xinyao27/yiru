import { Text, View } from 'react-native'

type MobileTerminalLiveInputStatusProps = {
  readonly isAttaching: boolean
}

export function MobileTerminalLiveInputStatus({ isAttaching }: MobileTerminalLiveInputStatusProps) {
  return (
    <View className="flex-1 justify-center">
      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
        Live input
      </Text>
      {isAttaching ? (
        <Text className="text-muted-foreground font-mono text-xs" numberOfLines={1}>
          Uploading image to host
        </Text>
      ) : null}
    </View>
  )
}
