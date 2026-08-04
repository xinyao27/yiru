import { Text } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'

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
          contentClassName="justify-center rounded-full px-4"
          disabled={disabled}
          hitSlop={6}
          isProminent={index === 0}
          onPress={() => onRespond(option.send)}
          size="regular"
          tintColorClassName="accent-secondary"
        >
          <Text
            className={
              index === 0
                ? 'text-primary-foreground text-sm font-semibold'
                : 'text-foreground text-sm font-semibold'
            }
          >
            {option.label}
          </Text>
        </MobileGlassPressable>
      ))}
    </MobileGlassGroup>
  )
}
