import { ActivityIndicator, Text } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { Minus, Plus, type Icon } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

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
      className="w-full rounded-full"
      containerClassName="flex-1"
      contentClassName="h-9 flex-row items-center justify-center gap-1 rounded-full px-3"
      disabled={disabled}
      fallbackClassName="bg-secondary"
      onPress={onPress}
      size="regular"
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
        label={translate('mobile.sourceControl.stageAll', 'Stage All')}
        loading={stageLoading}
        onPress={onStageAll}
      />
      <MobileSourceControlBulkAction
        disabled={unstageDisabled}
        icon={Minus}
        label={translate('mobile.sourceControl.unstageAll', 'Unstage All')}
        loading={unstageLoading}
        onPress={onUnstageAll}
      />
      <MobileGlassIconButton
        accessibilityLabel={translate(
          'mobile.sourceControl.moreActions',
          'More source control actions'
        )}
        disabled={actionsDisabled}
        icon="more"
        onPress={onMore}
        size="regular"
      />
    </MobileGlassGroup>
  )
}
