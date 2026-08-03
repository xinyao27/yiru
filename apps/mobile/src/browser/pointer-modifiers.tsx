import { Text } from 'react-native'

import { translate } from '~/i18n/translate'
import { cn } from '~/style/class-names'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'

export type BrowserPointerModifier = 'cmd' | 'ctrl' | 'alt' | 'shift'

export const BROWSER_POINTER_MODIFIERS: { id: BrowserPointerModifier; label: string }[] = [
  { id: 'cmd', label: translate('mobile.browser.pointerModifier.command', 'Cmd') },
  { id: 'ctrl', label: translate('mobile.browser.pointerModifier.control', 'Ctrl') },
  { id: 'alt', label: translate('mobile.browser.pointerModifier.alt', 'Alt') },
  { id: 'shift', label: translate('mobile.browser.pointerModifier.shift', 'Shift') }
]

type Props = {
  disabled: boolean
  selectedModifiers: BrowserPointerModifier[]
  onToggle: (modifier: BrowserPointerModifier) => void
}

export function MobileBrowserPointerModifiers({
  disabled,
  selectedModifiers,
  onToggle
}: Props): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row gap-2 px-2 pt-1" spacing={8}>
      {BROWSER_POINTER_MODIFIERS.map((modifier) => {
        const selected = selectedModifiers.includes(modifier.id)
        return (
          <MobileGlassPressable
            key={modifier.id}
            className="min-h-8 min-w-11 rounded-full"
            contentClassName="min-h-8 items-center justify-center rounded-full px-3"
            disabled={disabled}
            accessibilityLabel={translate(
              'mobile.browser.pointerModifier.accessibilityLabel',
              '{{modifier}} click modifier',
              { modifier: modifier.label }
            )}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            isSelected={selected}
            onPress={() => onToggle(modifier.id)}
          >
            <Text
              className={cn(
                'text-muted-foreground font-mono text-xs',
                selected && 'text-foreground'
              )}
            >
              {modifier.label}
            </Text>
          </MobileGlassPressable>
        )
      })}
    </MobileGlassGroup>
  )
}
