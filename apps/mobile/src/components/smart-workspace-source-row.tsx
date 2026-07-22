import { Pressable, Text, View } from 'react-native'

import { TextAa as CaseSensitive, GitBranch, Sparkle as Sparkles } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { SmartWorkspaceSourceRow as SourceRow } from '../../../desktop/src/shared/new-workspace/smart-workspace-source-results'
import { SourceProviderLogo } from './source-provider-logo'

type Props = {
  row: SourceRow
  onPress: () => void
}

type RowContent = {
  icon: React.ReactNode
  title: string
  subtitle?: string
  status?: string
}

function resolveRowContent(row: SourceRow): RowContent {
  switch (row.kind) {
    case 'use-name':
      return {
        icon: <Sparkles size={16} colorClassName="accent-muted-foreground" />,
        title: `Use "${row.name}"`,
        subtitle: 'Name this workspace'
      }
    case 'create-branch':
      return {
        icon: <GitBranch size={16} colorClassName="accent-primary" />,
        title: `Create branch "${row.name}"`,
        subtitle: 'New branch'
      }
    case 'github':
      return {
        icon: (
          <SourceProviderLogo
            provider="github"
            size={16}
            colorClassName="accent-muted-foreground"
          />
        ),
        title: row.item.title,
        subtitle: `PR #${row.item.number}`,
        status: row.item.state
      }
    case 'gitlab':
      return {
        icon: (
          <SourceProviderLogo
            provider="gitlab"
            size={16}
            colorClassName="accent-muted-foreground"
          />
        ),
        title: row.item.title,
        subtitle: `MR !${row.item.number}`,
        status: row.item.state
      }
    case 'branch':
      return {
        icon: <GitBranch size={16} colorClassName="accent-muted-foreground" />,
        title: row.localBranchName || row.refName,
        subtitle: row.refName
      }
    default:
      return {
        icon: <CaseSensitive size={16} colorClassName="accent-muted-foreground" />,
        title: ''
      }
  }
}

export function SmartWorkspaceSourceRow({ row, onPress }: Props) {
  const content = resolveRowContent(row)
  return (
    <Pressable className={cn(styles.row, styles.rowPressedActive)} onPress={onPress}>
      <View className={styles.icon}>{content.icon}</View>
      <View className={styles.copy}>
        <Text className={styles.title} numberOfLines={1}>
          {content.title}
        </Text>
        {content.subtitle ? (
          <Text className={styles.subtitle} numberOfLines={1}>
            {content.subtitle}
          </Text>
        ) : null}
      </View>
      {content.status ? (
        <View className={styles.pill}>
          <Text className={styles.pillText} numberOfLines={1}>
            {content.status}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = {
  row: cn('flex-row items-center gap-2 py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  icon: cn('w-[18px] items-center'),
  copy: cn('flex-1 min-w-0'),
  title: cn('text-[14px] text-foreground'),
  subtitle: cn('text-[12px] text-muted-foreground/60 mt-[1px]'),
  pill: cn('bg-secondary rounded-none px-2 py-[2px]'),
  pillText: cn('text-[11px] font-semibold text-muted-foreground capitalize')
} as const
