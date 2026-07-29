import { Switch, Text, TextInput, View } from 'react-native'

import type { MobileComposerSource } from '../workspace-create/use-composer-source'
import { MobileGlassSurface } from './glass/surface'

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
        <View className="mb-3">
          <Text className="text-muted-foreground mb-1 text-xs font-medium">Name</Text>
          <MobileGlassSurface className="min-h-10 overflow-hidden rounded-full" isInteractive>
            <TextInput
              className="text-foreground min-h-10 rounded-full px-4 text-sm"
              value={composer.name}
              onChangeText={composer.setName}
              placeholder="Workspace name"
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MobileGlassSurface>
        </View>
      ) : null}

      {showBranchOverride ? (
        <View className="mb-3">
          <Text className="text-muted-foreground mb-1 text-xs font-medium">Branch name</Text>
          <MobileGlassSurface className="min-h-10 overflow-hidden rounded-full" isInteractive>
            <TextInput
              className="text-foreground min-h-10 rounded-full px-4 text-sm"
              value={composer.branchNameOverride ?? ''}
              onChangeText={composer.handleBranchNameOverrideChange}
              placeholder="Derived from name"
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MobileGlassSurface>
        </View>
      ) : null}

      {composer.reuseEligibleBranch ? (
        <View className="mb-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-muted-foreground flex-1 text-xs" numberOfLines={1}>
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
