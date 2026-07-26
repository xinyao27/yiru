import { View, Text, Pressable } from 'react-native'

import { cn } from '@/style/class-names'

import { BottomDrawer } from './bottom-drawer'

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
        <Pressable
          className={cn(styles.button, 'bg-card', styles.pressedActive)}
          onPress={onCancel}
        >
          <Text className="text-muted-foreground text-sm font-semibold">{cancelLabel}</Text>
        </Pressable>
        <Pressable
          className={cn(
            styles.button,
            destructive ? 'bg-destructive' : 'bg-primary',
            styles.pressedActive
          )}
          onPress={() => {
            onConfirm()
            onCancel()
          }}
        >
          <Text
            className={cn(
              destructive
                ? 'text-sm font-semibold text-destructive-foreground'
                : 'text-sm font-semibold text-primary-foreground'
            )}
          >
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = {
  button: cn('flex-1 items-center rounded-xl py-2.5'),
  pressedActive: cn('active:bg-accent')
} as const
