import { Pressable } from 'react-native'

import { MobileGlassSurface } from '@/components/glass/surface'
import { Plus } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

export function NewWorkspaceFab({ onPress, disabled }: NewWorkspaceFabProps): React.JSX.Element {
  return (
    <MobileGlassSurface
      className={cn(
        'bottom-safe-offset-6 absolute right-4 h-12 w-12 overflow-hidden rounded-full',
        disabled && 'opacity-50'
      )}
      isInteractive={!disabled}
      tintColorClassName="accent-accent"
    >
      <Pressable
        accessibilityLabel="New workspace"
        accessibilityRole="button"
        className="active:bg-accent h-full w-full items-center justify-center"
        disabled={disabled}
        hitSlop={8}
        onPress={onPress}
      >
        <Plus size={24} colorClassName="accent-foreground" />
      </Pressable>
    </MobileGlassSurface>
  )
}
