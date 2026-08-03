import type { SmartWorkspaceSourceRow as SourceRow } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'

import { GitMerge, Sparkle as Sparkles } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { SourceProviderLogo } from '../components/source-provider-logo'

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
        title: translate('mobile.newWorkspace.source.useName', 'Use "{{name}}"', {
          name: row.name
        }),
        subtitle: translate('mobile.newWorkspace.source.nameWorkspace', 'Name this workspace')
      }
    case 'create-branch':
      return {
        icon: <GitMerge size={16} colorClassName="accent-primary" />,
        title: translate('mobile.newWorkspace.source.createBranch', 'Create branch "{{name}}"', {
          name: row.name
        }),
        subtitle: translate('mobile.newWorkspace.source.newBranch', 'New branch')
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
        subtitle: translate('mobile.newWorkspace.source.pullRequestNumber', 'PR #{{number}}', {
          number: row.item.number
        }),
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
        subtitle: translate('mobile.newWorkspace.source.mergeRequestNumber', 'MR !{{number}}', {
          number: row.item.number
        }),
        status: row.item.state
      }
    case 'branch':
      return {
        icon: <GitMerge size={16} colorClassName="accent-muted-foreground" />,
        title: row.localBranchName || row.refName,
        subtitle: row.refName
      }
  }
}

export function SmartWorkspaceSourceRow({ row, onPress }: Props): React.JSX.Element {
  const content = resolveRowContent(row)
  return (
    <Pressable className="active:bg-accent flex-row items-center gap-2 px-3 py-3" onPress={onPress}>
      <View className="w-5 items-center">{content.icon}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-sm" numberOfLines={1}>
          {content.title}
        </Text>
        {content.subtitle ? (
          <Text className="text-muted-foreground mt-1 text-xs" numberOfLines={1}>
            {content.subtitle}
          </Text>
        ) : null}
      </View>
      {content.status ? (
        <View className="bg-secondary rounded-full px-2 py-1">
          <Text
            className="text-muted-foreground text-xs font-semibold capitalize"
            numberOfLines={1}
          >
            {content.status}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
