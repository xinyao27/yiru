import { View, Text, Pressable } from 'react-native'

import { cn } from '@/style/class-names'

// Why: auth-failed is no longer necessarily terminal (issue #5200) — a
// transient rejection can latch it even though the desktop still lists this
// device. Offer Retry (fresh client + handshake) ahead of the disruptive
// re-pair flow so the common transient case recovers without re-pairing.
export function AuthFailedBanner({
  canRetry,
  onRetry,
  onRepair,
  onRemove
}: {
  canRetry: boolean
  onRetry: () => void
  onRepair: () => void
  onRemove: () => void
}) {
  return (
    <View className={styles.banner}>
      <Text className={styles.text}>
        Authentication failed — try reconnecting first; if it keeps failing, re-pair from desktop.
      </Text>
      <View className={styles.actions}>
        {canRetry && (
          <Pressable className={styles.action} onPress={onRetry}>
            <Text className={styles.actionText}>Retry</Text>
          </Pressable>
        )}
        <Pressable className={styles.action} onPress={onRepair}>
          <Text className={styles.actionText}>Re-pair</Text>
        </Pressable>
        <Pressable className={styles.action} onPress={onRemove}>
          <Text className={cn(styles.actionText, 'text-destructive')}>Remove</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = {
  banner: cn('bg-card py-2 px-4 border-b border-b-border'),
  text: cn('text-destructive text-[13px] mb-2'),
  actions: cn('flex-row gap-4'),
  action: cn('py-1'),
  actionText: cn('text-primary text-[13px] font-semibold')
} as const
