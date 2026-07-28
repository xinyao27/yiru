import { Text } from 'react-native'

import { cn } from '@/style/class-names'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'

export type BrowserPointerModifier = 'cmd' | 'ctrl' | 'alt' | 'shift'

export const BROWSER_POINTER_MODIFIERS: { id: BrowserPointerModifier; label: string }[] = [
  { id: 'cmd', label: 'Cmd' },
  { id: 'ctrl', label: 'Ctrl' },
  { id: 'alt', label: 'Alt' },
  { id: 'shift', label: 'Shift' }
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
            className={cn('min-h-8 min-w-11 rounded-full', selected && 'border-muted-foreground')}
            contentClassName="min-h-8 items-center justify-center rounded-full px-3"
            disabled={disabled}
            accessibilityLabel={`${modifier.label} click modifier`}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
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
