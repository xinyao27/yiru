import {
  MobileSwiftUiGlassAccessoryButton,
  type MobileSwiftUiGlassAccessoryButtonProps
} from '../../components/glass/swift-ui.ios'
import type { MobileTerminalAccessoryIcon, MobileTerminalAccessoryKeyProps } from './accessory-key'

const TERMINAL_ACCESSORY_SYSTEM_IMAGES = {
  add: 'plus',
  desktop: 'desktopcomputer',
  'dismiss-keyboard': 'keyboard.chevron.compact.down',
  'live-input': 'chevron.right.2',
  phone: 'iphone'
} as const satisfies Record<
  MobileTerminalAccessoryIcon,
  NonNullable<MobileSwiftUiGlassAccessoryButtonProps['systemImage']>
>

export function MobileTerminalAccessoryKey({
  icon,
  ...buttonProps
}: MobileTerminalAccessoryKeyProps): React.JSX.Element {
  return (
    <MobileSwiftUiGlassAccessoryButton
      {...buttonProps}
      iconSize={icon === 'desktop' || icon === 'phone' ? 14 : undefined}
      systemImage={icon ? TERMINAL_ACCESSORY_SYSTEM_IMAGES[icon] : undefined}
    />
  )
}
