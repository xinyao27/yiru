import { View, Text } from 'react-native'

import { BottomDrawer } from './bottom-drawer'
import { MobileGlassTextButton } from './glass/text-button'

type Props = {
  visible: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel
}: Props) {
  return (
    <BottomDrawer visible={visible} onClose={onCancel}>
      <View className="pb-4">
        <Text className="text-foreground text-sm font-bold">{title}</Text>
        {message ? (
          <Text className="text-muted-foreground mt-1 text-sm leading-5">{message}</Text>
        ) : null}
      </View>
      <View className="flex-row gap-2">
        <MobileGlassTextButton
          className="flex-1"
          isFullWidth
          label={cancelLabel}
          onPress={onCancel}
        />
        <MobileGlassTextButton
          className="flex-1"
          isDestructive={destructive}
          isFullWidth
          isProminent={!destructive}
          label={confirmLabel}
          onPress={() => {
            onConfirm()
            onCancel()
          }}
        />
      </View>
    </BottomDrawer>
  )
}
