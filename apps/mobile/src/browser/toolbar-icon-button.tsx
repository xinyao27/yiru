import type { ReactNode } from 'react'

import { MobileGlassPressable } from '../components/glass/pressable'

type Props = {
  children: ReactNode
  disabled?: boolean
  label: string
  onPress: () => void
}

export function MobileBrowserToolbarIconButton({
  children,
  disabled,
  label,
  onPress
}: Props): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={label}
      className="h-8 w-8 rounded-full"
      contentClassName="h-full w-full items-center justify-center rounded-full"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
    >
      {children}
    </MobileGlassPressable>
  )
}
