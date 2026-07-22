import { memo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { SealQuestion as ShieldQuestion } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileChatPermission } from './mobile-native-chat-permission'

// Renders a detected agent permission ask as a card with tappable options.
// The first option is treated as the primary (allow) action and gets a filled
// accent button so the affirmative choice reads as distinct from the rest.
function MobileNativeChatPermissionImpl({
  permission,
  onRespond
}: {
  permission: MobileChatPermission
  onRespond: (send: string) => Promise<boolean>
}): React.JSX.Element {
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const respond = async (send: string): Promise<void> => {
    if (submittingRef.current) {
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    const accepted = await onRespond(send)
    if (!accepted) {
      submittingRef.current = false
      setSubmitting(false)
    }
  }
  return (
    <View className={styles.card}>
      <View className={styles.header}>
        <ShieldQuestion size={16} colorClassName="accent-primary" />
        <Text className={styles.title}>{permission.title}</Text>
      </View>
      {permission.detail ? <Text className={styles.detail}>{permission.detail}</Text> : null}
      <View className={styles.options}>
        {permission.options.map((option, index) => {
          const isPrimary = index === 0
          return (
            <Pressable
              key={`${option.send}:${option.label}`}
              className={cn(
                styles.option,
                isPrimary ? styles.optionPrimary : styles.optionSecondary,
                !submitting && styles.optionPressedActive
              )}
              hitSlop={6}
              onPress={() => respond(option.send)}
              disabled={submitting}
            >
              <Text className={cn(styles.optionText, isPrimary && styles.optionTextPrimary)}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export const MobileNativeChatPermission = memo(MobileNativeChatPermissionImpl)

const styles = {
  card: cn('mx-4 my-2 p-3 gap-2 rounded-none border-hairline border-border bg-card'),
  header: cn('flex-row items-center gap-2'),
  title: cn('text-foreground text-[14px] font-semibold'),
  detail: cn('text-muted-foreground text-[12px] leading-[17px]'),
  options: cn('flex-row flex-wrap gap-2'),
  option: cn('min-h-11 justify-center px-3 py-2 rounded-none'),
  optionPrimary: cn('bg-primary'),
  optionSecondary: cn('bg-secondary border-hairline border-border'),
  optionPressedActive: cn('active:opacity-[0.7]'),
  optionText: cn('text-foreground text-[14px] font-semibold'),
  optionTextPrimary: cn('text-primary-foreground')
} as const
