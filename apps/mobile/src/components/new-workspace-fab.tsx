import { MobileGlassPressable } from '@/components/glass/pressable'
import { Plus } from '@/components/uniwind-icons'

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

export function NewWorkspaceFab({ onPress, disabled }: NewWorkspaceFabProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel="New workspace"
      accessibilityRole="button"
      className="bottom-safe-offset-6 absolute right-4 h-12 w-12 rounded-full"
      contentClassName="h-full w-full items-center justify-center"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      tintColorClassName="accent-accent"
    >
      <Plus size={24} colorClassName="accent-foreground" />
    </MobileGlassPressable>
  )
}
