import { memo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { SealQuestion as ShieldQuestion } from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'
import type { MobileChatPermission } from './permission'

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
    <View className="border-hairline border-border bg-card mx-4 my-2 gap-2 p-3">
      <View className="flex-row items-center gap-2">
        <ShieldQuestion size={16} colorClassName="accent-primary" />
        <Text className="text-foreground text-sm font-semibold">{permission.title}</Text>
      </View>
      {permission.detail ? (
        <Text className="text-muted-foreground text-xs leading-[17px]">{permission.detail}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {permission.options.map((option, index) => {
          const isPrimary = index === 0
          return (
            <Pressable
              key={`${option.send}:${option.label}`}
              className={cn(
                'min-h-11 justify-center px-3 py-2',
                isPrimary ? 'bg-primary' : 'bg-secondary border-hairline border-border',
                !submitting && 'active:bg-accent'
              )}
              hitSlop={6}
              onPress={() => respond(option.send)}
              disabled={submitting}
            >
              <Text
                className={cn(
                  'text-foreground text-sm font-semibold',
                  isPrimary && 'text-primary-foreground'
                )}
              >
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
