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
      <View className={styles.content}>
        <Text className={styles.title}>{title}</Text>
        {message ? <Text className={styles.message}>{message}</Text> : null}
      </View>
      <View className={styles.buttons}>
        <Pressable
          className={cn(styles.button, styles.cancelButton, styles.pressedActive)}
          onPress={onCancel}
        >
          <Text className={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          className={cn(
            styles.button,
            destructive ? styles.destructiveButton : styles.confirmButton,
            styles.pressedActive
          )}
          onPress={() => {
            onConfirm()
            onCancel()
          }}
        >
          <Text className={cn(destructive ? styles.destructiveText : styles.confirmText)}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = {
  content: cn('pb-4'),
  title: cn('text-[16px] font-bold text-foreground'),
  message: cn('text-[14px] text-muted-foreground mt-1 leading-[20px]'),
  buttons: cn('flex-row gap-2'),
  button: cn('flex-1 py-2.5 rounded-none items-center'),
  cancelButton: cn('bg-card'),
  confirmButton: cn('bg-foreground'),
  destructiveButton: cn('bg-destructive'),
  pressed: cn('opacity-[0.7]'),
  pressedActive: cn('active:opacity-[0.7]'),
  cancelText: cn('text-[14px] font-semibold text-muted-foreground'),
  confirmText: cn('text-[14px] font-semibold text-background'),
  destructiveText: cn('text-[14px] font-semibold text-destructive-foreground')
} as const
