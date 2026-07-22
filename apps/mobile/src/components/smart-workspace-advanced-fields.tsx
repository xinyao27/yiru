import { Switch, Text, TextInput, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { MobileComposerSource } from '../workspace-create/use-mobile-composer-source'

type Props = {
  composer: MobileComposerSource
  selectedRepoIsGit: boolean
}

// The Advanced-section source controls: the editable Name appears once a source
// pill is shown (the field itself is no longer the name input); the branch-name
// override and reuse toggle mirror the desktop composer's advanced branch fields.
export function SmartWorkspaceAdvancedFields({ composer, selectedRepoIsGit }: Props) {
  const selection = composer.smartNameSelection
  const showBranchOverride = selectedRepoIsGit && (!selection || selection.kind === 'branch')
  return (
    <>
      {selection ? (
        <View className={styles.field}>
          <Text className={styles.label}>Name</Text>
          <TextInput
            className={styles.input}
            value={composer.name}
            onChangeText={composer.setName}
            placeholder="Workspace name"
            placeholderTextColorClassName="accent-muted-foreground"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ) : null}

      {showBranchOverride ? (
        <View className={styles.field}>
          <Text className={styles.label}>Branch name</Text>
          <TextInput
            className={styles.input}
            value={composer.branchNameOverride ?? ''}
            onChangeText={composer.handleBranchNameOverrideChange}
            placeholder="Derived from name"
            placeholderTextColorClassName="accent-muted-foreground"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ) : null}

      {composer.reuseEligibleBranch ? (
        <View className={styles.field}>
          <View className={styles.reuseRow}>
            <Text className={styles.reuseLabel} numberOfLines={1}>
              Reuse branch “{composer.reuseEligibleBranch}”
            </Text>
            <Switch
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
              value={composer.reuseSelectedBranch}
              onValueChange={composer.setReuseSelectedBranch}
              trackColorOffClassName="accent-border"
              trackColorOnClassName="accent-muted-foreground"
              thumbColorClassName="accent-foreground"
              ios_backgroundColorClassName="accent-border"
            />
          </View>
        </View>
      ) : null}
    </>
  )
}

const styles = {
  field: cn('mb-3'),
  label: cn('text-[13px] font-medium text-muted-foreground mb-1'),
  input: cn(
    'bg-secondary text-foreground rounded-none px-3 py-2 ios:py-2.5 text-[14px] border border-border'
  ),
  reuseRow: cn('flex-row items-center justify-between gap-2'),
  reuseLabel: cn('flex-1 text-[13px] text-muted-foreground')
} as const
