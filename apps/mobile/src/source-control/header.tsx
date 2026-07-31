import { Text, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'

type Props = {
  embedded: boolean
  worktreeLabel: string
  ioBusy: boolean
  onBack: () => void
  onRefresh: () => void
  // When set (PR segment ready with a host URL), show open-on-web flush-right of
  // the title so the control stays visible while the PR body scrolls.
  onOpenPrWeb?: () => void
  prNumber?: number | null
}

export function MobileSourceControlHeader({
  embedded,
  worktreeLabel,
  ioBusy,
  onBack,
  onRefresh,
  onOpenPrWeb,
  prNumber = null
}: Props) {
  return (
    <View className="min-h-15 flex-row items-center gap-2 px-3">
      <MobileGlassIconButton
        accessibilityLabel={embedded ? 'Close source control' : 'Back to session'}
        icon={embedded ? 'close' : 'back'}
        onPress={onBack}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
          Source Control
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs" numberOfLines={1}>
          {worktreeLabel}
        </Text>
      </View>
      <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
        {onOpenPrWeb ? (
          <MobileGlassIconButton
            accessibilityLabel={
              prNumber != null
                ? `Open pull request #${prNumber} on the web`
                : 'Open pull request on the web'
            }
            icon="external"
            onPress={onOpenPrWeb}
          />
        ) : null}
        <MobileGlassIconButton
          accessibilityLabel="Refresh source control"
          disabled={ioBusy}
          icon="refresh"
          onPress={onRefresh}
        />
      </MobileGlassGroup>
    </View>
  )
}
