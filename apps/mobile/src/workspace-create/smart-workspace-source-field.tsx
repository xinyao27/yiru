import { cn } from 'cnfast'
import { Linking, Text, View } from 'react-native'

import { GitMerge, GitPullRequest } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { MobileGlassPressable } from '../components/glass/pressable'
import type { SmartNameSelection } from './composer-source-types'
import type { MobileComposerSource } from './use-composer-source'

type Props = {
  composer: MobileComposerSource
  label: string
  disabled?: boolean
  onBeforeOpen?: () => void
  onOpenDrawer: () => void
}

function SelectionIcon({ kind }: { kind: SmartNameSelection['kind'] }): React.JSX.Element {
  if (kind === 'github-pr') {
    return <GitPullRequest size={15} colorClassName="accent-muted-foreground" />
  }
  if (kind === 'gitlab-mr') {
    return <GitMerge size={15} colorClassName="accent-muted-foreground" />
  }
  return <GitMerge size={15} colorClassName="accent-muted-foreground" />
}

export function SmartWorkspaceSourceField({
  composer,
  label,
  disabled,
  onBeforeOpen,
  onOpenDrawer
}: Props): React.JSX.Element {
  const selection = composer.smartNameSelection

  function openDrawer(): void {
    if (disabled) {
      return
    }
    onBeforeOpen?.()
    onOpenDrawer()
  }

  return (
    <View className="mb-3">
      <Text className="text-muted-foreground mb-1 text-xs font-medium">
        {label}{' '}
        <Text className="text-muted-foreground font-normal">
          {translate('mobile.common.optional', '[Optional]')}
        </Text>
      </Text>
      {selection ? (
        <View className="min-h-11 flex-row items-center gap-2 rounded-xl px-3">
          <SelectionIcon kind={selection.kind} />
          <Text className="text-foreground flex-1 text-sm" numberOfLines={1}>
            {selection.label}
          </Text>
          <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
            {selection.url ? (
              <MobileGlassIconButton
                accessibilityLabel={translate(
                  'mobile.newWorkspace.source.openSelected',
                  'Open selected source'
                )}
                icon="external"
                onPress={() => selection.url && void Linking.openURL(selection.url).catch(() => {})}
                size="small"
              />
            ) : null}
            <MobileGlassIconButton
              accessibilityLabel={translate(
                'mobile.newWorkspace.source.clearSelected',
                'Clear selected source'
              )}
              icon="close"
              onPress={composer.handleClearSmartNameSelection}
              size="small"
            />
          </MobileGlassGroup>
        </View>
      ) : (
        <MobileGlassPressable
          className="rounded-xl"
          contentClassName="rounded-xl px-3 py-3"
          disabled={disabled}
          onPress={openDrawer}
        >
          <Text
            className={cn('text-sm text-foreground', !composer.name && 'text-muted-foreground')}
            numberOfLines={1}
          >
            {composer.name ||
              translate(
                'mobile.newWorkspace.source.searchPlaceholder',
                'Type a name or search a source'
              )}
          </Text>
        </MobileGlassPressable>
      )}
    </View>
  )
}
