import { Text } from 'react-native'

import { MobileGlassGroup } from '../../components/glass/group'
import { MobileGlassPressable } from '../../components/glass/pressable'
import type { MobileChatPermission } from './permission'

type MobileNativeChatPermissionActionsProps = {
  disabled: boolean
  options: MobileChatPermission['options']
  onRespond: (send: string) => void
}

export function MobileNativeChatPermissionActions({
  disabled,
  options,
  onRespond
}: MobileNativeChatPermissionActionsProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row flex-wrap gap-2" spacing={8}>
      {options.map((option, index) => (
        <MobileGlassPressable
          key={`${option.send}:${option.label}`}
          className="rounded-full"
          contentClassName="min-h-10 justify-center rounded-full px-4"
          disabled={disabled}
          hitSlop={6}
          onPress={() => onRespond(option.send)}
          tintColorClassName={index === 0 ? 'accent-primary' : 'accent-secondary'}
        >
          <Text className="text-foreground text-sm font-semibold">{option.label}</Text>
        </MobileGlassPressable>
      ))}
    </MobileGlassGroup>
  )
}
