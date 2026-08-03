import { useState, type ReactNode } from 'react'
import { ActivityIndicator, View, Text, Pressable } from 'react-native'

import type { Icon } from '~/components/uniwind-icons'
import { cn } from '~/style/class-names'

import { BottomDrawer } from './bottom-drawer'
import { MobileContentSection } from './content-section'

type ActionSheetActionIcon =
  | { icon: Icon; renderIcon?: never }
  | { icon?: never; renderIcon: () => ReactNode }

type ActionSheetActionDismiss =
  | { dismiss: 'immediate' | 'manual'; onPress: () => void | Promise<void> }
  | { dismiss: 'on-success'; onPress: () => boolean | Promise<boolean> }

export type ActionSheetAction = {
  id: string
  label: string
  destructive?: boolean
  disabled?: boolean
  hint?: string
  loading?: boolean
} & ActionSheetActionIcon &
  ActionSheetActionDismiss

type ActionSheetModalProps = {
  visible: boolean
  title?: string
  message?: string
  actions: ActionSheetAction[]
  onClose: () => void
}

type ActionSheetContentProps = {
  title?: string
  message?: string
  actions: ActionSheetAction[]
  onClose?: () => void
}

export function ActionSheetContent({
  title,
  message,
  actions,
  onClose
}: ActionSheetContentProps): React.JSX.Element {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  async function runAction(action: ActionSheetAction): Promise<void> {
    if (action.dismiss === 'immediate') {
      onClose?.()
      await action.onPress()
      return
    }
    if (action.dismiss === 'manual') {
      await action.onPress()
      return
    }
    setPendingActionId(action.id)
    try {
      if (await action.onPress()) {
        onClose?.()
      }
    } finally {
      setPendingActionId(null)
    }
  }

  return (
    <>
      {(title || message) && (
        <View className="px-1 pb-2">
          {title ? (
            <Text className="text-muted-foreground text-xs font-medium" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {message ? <Text className="text-muted-foreground mt-1 text-xs">{message}</Text> : null}
        </View>
      )}

      <MobileContentSection>
        {actions.map((action, i) => {
          const Icon = action.icon
          const customIcon = action.renderIcon?.()
          const isPending = pendingActionId === action.id
          return (
            <View key={action.id}>
              {i > 0 && <View className="h-hairline bg-border mx-3" />}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  busy: action.loading || isPending,
                  disabled: action.disabled || action.loading || pendingActionId !== null
                }}
                className={cn(
                  'flex-row items-center gap-2 py-3 px-3',
                  action.disabled && 'opacity-60',
                  !action.disabled && !action.loading && !isPending && 'active:bg-accent'
                )}
                disabled={action.disabled || action.loading || pendingActionId !== null}
                onPress={() => void runAction(action)}
              >
                {customIcon ??
                  (Icon ? (
                    <Icon
                      size={16}
                      colorClassName={
                        action.destructive ? 'accent-destructive' : 'accent-muted-foreground'
                      }
                    />
                  ) : null)}
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
                    <Text className="text-muted-foreground mt-1 text-xs">{action.hint}</Text>
                  ) : null}
                </View>
                {action.loading || isPending ? (
                  <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                ) : null}
              </Pressable>
            </View>
          )
        })}
      </MobileContentSection>
    </>
  )
}

export function ActionSheetModal({
  visible,
  title,
  message,
  actions,
  onClose
}: ActionSheetModalProps): React.JSX.Element {
  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <ActionSheetContent title={title} message={message} actions={actions} onClose={onClose} />
    </BottomDrawer>
  )
}
