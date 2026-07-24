import { Linking, Pressable, Text, View } from 'react-native'

import {
  ArrowSquareOut as ExternalLink,
  GitMerge,
  GitPullRequest,
  X
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { SmartNameSelection } from '../workspace-create/mobile-composer-source-types'
import type { MobileComposerSource } from '../workspace-create/use-mobile-composer-source'

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
    <View className={styles.field}>
      <Text className={styles.label}>
        {label} <Text className={styles.labelHint}>[Optional]</Text>
      </Text>
      {selection ? (
        <View className={styles.pill}>
          <SelectionIcon kind={selection.kind} />
          <Text className={styles.pillLabel} numberOfLines={1}>
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
          className={cn(styles.input, disabled && styles.disabled)}
          disabled={disabled}
          onPress={openDrawer}
        >
          <Text
            className={cn(styles.inputText, !composer.name && styles.inputPlaceholder)}
            numberOfLines={1}
          >
            {composer.name || 'Type a name or search a source'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = {
  field: cn('mb-3'),
  label: cn('text-[13px] font-medium text-muted-foreground mb-1'),
  labelHint: cn('font-normal text-muted-foreground/60'),
  input: cn('bg-secondary rounded-none px-3 py-2.5 border border-border'),
  disabled: cn('opacity-[0.55]'),
  inputText: cn('text-[14px] text-foreground'),
  inputPlaceholder: cn('text-muted-foreground/60'),
  pill: cn('flex-row items-center gap-2 bg-secondary rounded-none px-3 py-2 border border-border'),
  pillLabel: cn('flex-1 text-[14px] text-foreground')
} as const
