import { Text, View } from 'react-native'

import { MobileContentSection } from './content-section'
import { MobileGlassTextButton } from './glass/text-button'

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
    <MobileContentSection className="mx-3 mt-2 px-4 py-2">
      <Text className="text-destructive mb-2 text-xs">
        Authentication failed — try reconnecting first; if it keeps failing, re-pair from desktop.
      </Text>
      <View className="flex-row gap-4">
        {canRetry && <MobileGlassTextButton label="Retry" onPress={onRetry} size="small" />}
        <MobileGlassTextButton label="Re-pair" onPress={onRepair} size="small" />
        <MobileGlassTextButton isDestructive label="Remove" onPress={onRemove} size="small" />
      </View>
    </MobileContentSection>
  )
}
