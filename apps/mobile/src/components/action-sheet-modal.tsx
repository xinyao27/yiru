import { useRef, type ReactNode } from 'react'
import { ActivityIndicator, View, Text, Pressable } from 'react-native'

import { PencilSimple as Edit3, Trash as Trash2, type Icon } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from './bottom-drawer'

export type ActionSheetAction = {
  label: string
  icon?: Icon
  renderIcon?: () => ReactNode
  destructive?: boolean
  disabled?: boolean
  hint?: string
  loading?: boolean
  skipAutoClose?: boolean
  closeBeforePress?: boolean
  onPress: () => void
}

type Props = {
  visible: boolean
  title?: string
  message?: string
  actions: ActionSheetAction[]
  onClose: () => void
}

function iconForAction(label: string, destructive?: boolean, icon?: Icon): Icon {
  if (icon) {
    return icon
  }
  if (destructive || /delete|remove/i.test(label)) {
    return Trash2
  }
  return Edit3
}

type ContentProps = {
  title?: string
  message?: string
  actions: ActionSheetAction[]
  onClose?: () => void
}

export function ActionSheetContent({ title, message, actions, onClose }: ContentProps) {
  return (
    <>
      {(title || message) && (
        <View className={styles.header}>
          {title ? (
            <Text className={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {message ? <Text className={styles.message}>{message}</Text> : null}
        </View>
      )}

      <View className={styles.actionGroup}>
        {actions.map((action, i) => {
          const Icon = iconForAction(action.label, action.destructive, action.icon)
          const customIcon = action.renderIcon?.()
          return (
            <View key={action.label}>
              {i > 0 && <View className={styles.separator} />}
              <Pressable
                className={cn(
                  styles.action,
                  action.disabled && styles.actionDisabled,
                  !action.disabled && !action.loading && styles.actionPressedActive
                )}
                disabled={action.disabled || action.loading}
                onPress={() => {
                  action.onPress()
                  if (!action.skipAutoClose && onClose) {
                    onClose()
                  }
                }}
              >
                {customIcon ?? (
                  <Icon
                    size={16}
                    colorClassName={
                      action.destructive ? 'accent-destructive' : 'accent-muted-foreground'
                    }
                  />
                )}
                <View className={styles.actionTextBlock}>
                  <Text
                    className={cn(
                      styles.actionText,
                      action.destructive && styles.actionTextDestructive,
                      action.disabled && styles.actionTextDisabled
                    )}
                  >
                    {action.label}
                  </Text>
                  {action.hint ? <Text className={styles.actionHint}>{action.hint}</Text> : null}
                </View>
                {action.loading ? (
                  <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                ) : null}
              </Pressable>
            </View>
          )
        })}
      </View>
    </>
  )
}

export function ActionSheetModal({ visible, title, message, actions, onClose }: Props) {
  const pendingActionRef = useRef<(() => void) | null>(null)
  const sequencedActions = actions.map((action) =>
    action.closeBeforePress
      ? {
          ...action,
          onPress: () => {
            pendingActionRef.current = action.onPress
          }
        }
      : action
  )

  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      onAfterClose={() => {
        // Why: iOS cannot present a second native modal until the action
        // sheet's native window has fully unmounted.
        const pendingAction = pendingActionRef.current
        pendingActionRef.current = null
        pendingAction?.()
      }}
      dragContentToDismiss
    >
      <ActionSheetContent
        title={title}
        message={message}
        actions={sequencedActions}
        onClose={onClose}
      />
    </BottomDrawer>
  )
}

const styles = {
  header: cn('px-1 pb-2'),
  title: cn('text-[13px] font-medium text-muted-foreground/60'),
  message: cn('text-[12px] text-muted-foreground/60 mt-[2px]'),
  actionGroup: cn('bg-card rounded-none overflow-hidden'),
  separator: cn('h-hairline bg-border mx-3'),
  action: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  actionDisabled: cn('opacity-[0.58]'),
  actionPressedActive: cn('active:bg-secondary'),
  actionTextBlock: cn('flex-1 min-w-0'),
  actionText: cn('text-[14px] font-medium text-foreground'),
  actionTextDisabled: cn('text-muted-foreground'),
  actionTextDestructive: cn('text-destructive'),
  actionHint: cn('mt-[2px] text-[12px] text-muted-foreground/60')
} as const
