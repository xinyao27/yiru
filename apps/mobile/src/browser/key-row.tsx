import { Text } from 'react-native'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassPressable } from '../components/glass/pressable'

export const BROWSER_KEYS = ['Enter', 'Backspace', 'Tab', 'Escape'] as const

type Props = {
  disabled: boolean
  onKeypress: (key: string) => void
}

export function MobileBrowserKeyRow({ disabled, onKeypress }: Props): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row gap-2 px-2 pt-1" spacing={8}>
      {BROWSER_KEYS.map((key) => (
        <MobileGlassPressable
          key={key}
          className="min-h-8 min-w-11 rounded-full"
          contentClassName="min-h-8 items-center justify-center rounded-full px-3"
          disabled={disabled}
          onPress={() => onKeypress(key)}
        >
          <Text className="text-muted-foreground font-mono text-xs">
            {key === 'Backspace' ? '⌫' : key === 'Escape' ? 'Esc' : key}
          </Text>
        </MobileGlassPressable>
      ))}
    </MobileGlassGroup>
  )
}
