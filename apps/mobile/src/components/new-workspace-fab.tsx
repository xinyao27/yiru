import { Pressable } from 'react-native'

import { Plus } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

// Phone-only floating "+" for creating a workspace. Absolutely positioned so it
// never intercepts list row taps, and lifted above the home indicator.
export function NewWorkspaceFab({ onPress, disabled }: NewWorkspaceFabProps): React.JSX.Element {
  return (
    <Pressable
      className={cn(
        styles.fab,
        styles.fabPressedActive,
        'bottom-safe-offset-6',
        disabled && styles.fabDisabled
      )}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="New workspace"
      hitSlop={8}
    >
      <Plus size={24} weight="regular" colorClassName="accent-primary-foreground" />
    </Pressable>
  )
}

const styles = {
  fab: cn('absolute right-4 w-12 h-12 rounded-none items-center justify-center bg-primary'),
  fabPressedActive: cn('active:bg-foreground'),
  fabDisabled: cn('opacity-[0.5]')
} as const
