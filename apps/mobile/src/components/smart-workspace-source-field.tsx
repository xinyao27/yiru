import { Linking, Pressable, Text, View } from 'react-native'

import {
  ArrowSquareOut as ExternalLink,
  GitMerge,
  GitPullRequest,
  X
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { SmartNameSelection } from '../workspace-create/composer-source-types'
import type { MobileComposerSource } from '../workspace-create/use-composer-source'

type Props = {
  composer: MobileComposerSource
  label: string
  disabled?: boolean
  onBeforeOpen?: () => void
  onOpenDrawer: () => void
}

function SelectionIcon({ kind }: { kind: SmartNameSelection['kind'] }) {
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
}: Props) {
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
        {label} <Text className="text-muted-foreground font-normal">[Optional]</Text>
      </Text>
      {selection ? (
        <View className="border-border bg-secondary flex-row items-center gap-2 rounded-xl border px-3 py-2">
          <SelectionIcon kind={selection.kind} />
          <Text className="text-foreground flex-1 text-sm" numberOfLines={1}>
            {selection.label}
          </Text>
          {selection.url ? (
            <Pressable
              hitSlop={6}
              onPress={() => selection.url && void Linking.openURL(selection.url).catch(() => {})}
            >
              <ExternalLink size={15} colorClassName="accent-muted-foreground" />
            </Pressable>
          ) : null}
          <Pressable hitSlop={6} onPress={composer.handleClearSmartNameSelection}>
            <X size={15} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      ) : (
        <Pressable
          className={cn(
            'border-border rounded-xl border bg-secondary px-3 py-2.5',
            disabled && 'opacity-60'
          )}
          disabled={disabled}
          onPress={openDrawer}
        >
          <Text
            className={cn('text-sm text-foreground', !composer.name && 'text-muted-foreground')}
            numberOfLines={1}
          >
            {composer.name || 'Type a name or search a source'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
