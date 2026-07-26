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
        <View className="px-1 pb-2">
          {title ? (
            <Text className="text-muted-foreground text-xs font-medium" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {message ? <Text className="text-muted-foreground mt-0.5 text-xs">{message}</Text> : null}
        </View>
      )}

      <View className="bg-card overflow-hidden rounded-2xl">
        {actions.map((action, i) => {
          const Icon = iconForAction(action.label, action.destructive, action.icon)
          const customIcon = action.renderIcon?.()
          return (
            <View key={action.label}>
              {i > 0 && <View className="h-hairline bg-border mx-3" />}
              <Pressable
                className={cn(
                  'flex-row items-center gap-2.5 py-3 px-3.5',
                  action.disabled && 'opacity-60',
                  !action.disabled && !action.loading && 'active:bg-accent'
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
                <View className="min-w-0 flex-1">
                  <Text
                    className={cn(
                      'text-sm font-medium text-foreground',
                      action.destructive && 'text-destructive',
                      action.disabled && 'text-muted-foreground'
                    )}
                  >
                    {action.label}
                  </Text>
                  {action.hint ? (
                    <Text className="text-muted-foreground mt-0.5 text-xs">{action.hint}</Text>
                  ) : null}
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
