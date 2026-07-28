import { ActivityIndicator, Text } from 'react-native'

import { MobileGlassGroup } from '@/components/glass/group'
import { MobileGlassPressable } from '@/components/glass/pressable'
import { Minus, DotsThree as MoreHorizontal, Plus, type Icon } from '@/components/uniwind-icons'

import type { MobileSourceControlBulkActionsProps } from './bulk-actions-props'

function MobileSourceControlBulkAction({
  disabled,
  icon: ActionIcon,
  label,
  loading,
  onPress
}: {
  disabled: boolean
  icon: Icon
  label: string
  loading: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={label}
      className="flex-1 rounded-full"
      contentClassName="min-h-9 flex-row items-center justify-center gap-1 rounded-full px-3"
      disabled={disabled}
      fallbackClassName="bg-secondary"
      hitSlop={4}
      onPress={onPress}
      tintColorClassName="accent-accent"
    >
      {loading ? (
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
      ) : (
        <ActionIcon size={16} colorClassName="accent-muted-foreground" />
      )}
      <Text className="text-foreground text-sm">{label}</Text>
    </MobileGlassPressable>
  )
}

export function MobileSourceControlBulkActions({
  actionsDisabled,
  onMore,
  onStageAll,
  onUnstageAll,
  stageDisabled,
  stageLoading,
  unstageDisabled,
  unstageLoading
}: MobileSourceControlBulkActionsProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="mt-3 flex-row items-center gap-2" spacing={8}>
      <MobileSourceControlBulkAction
        disabled={stageDisabled}
        icon={Plus}
        label="Stage All"
        loading={stageLoading}
        onPress={onStageAll}
      />
      <MobileSourceControlBulkAction
        disabled={unstageDisabled}
        icon={Minus}
        label="Unstage All"
        loading={unstageLoading}
        onPress={onUnstageAll}
      />
      <MobileGlassPressable
        accessibilityLabel="Open source control actions"
        className="h-9 w-9 rounded-full"
        contentClassName="h-full w-full items-center justify-center rounded-full"
        disabled={actionsDisabled}
        fallbackClassName="bg-secondary"
        hitSlop={4}
        onPress={onMore}
        tintColorClassName="accent-accent"
      >
        <MoreHorizontal size={18} colorClassName="accent-muted-foreground" />
      </MobileGlassPressable>
    </MobileGlassGroup>
  )
}
