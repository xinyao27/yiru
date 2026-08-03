import { Text, TextInput, View } from 'react-native'

import { translate } from '~/i18n/translate'

import { MobileGlassSurface } from '../components/glass/surface'
import { SettingsToggleRow } from '../components/settings-toggle-row'
import type { MobileComposerSource } from './use-composer-source'

type Props = {
  composer: MobileComposerSource
  selectedRepoIsGit: boolean
}

// The Advanced-section source controls: the editable Name appears once a source
// pill is shown (the field itself is no longer the name input); the branch-name
// override and reuse toggle mirror the desktop composer's advanced branch fields.
export function SmartWorkspaceAdvancedFields({
  composer,
  selectedRepoIsGit
}: Props): React.JSX.Element {
  const selection = composer.smartNameSelection
  const showBranchOverride = selectedRepoIsGit && (!selection || selection.kind === 'branch')
  return (
    <>
      {selection ? (
        <View className="mb-3">
          <Text className="text-muted-foreground mb-1 text-xs font-medium">
            {translate('mobile.newWorkspace.nameLabel', 'Name')}
          </Text>
          <MobileGlassSurface className="min-h-11 overflow-hidden rounded-full" isInteractive>
            <TextInput
              className="text-foreground min-h-11 rounded-full px-4 text-sm"
              value={composer.name}
              onChangeText={composer.setName}
              placeholder={translate(
                'mobile.newWorkspace.workspaceNamePlaceholder',
                'Workspace name'
              )}
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MobileGlassSurface>
        </View>
      ) : null}

      {showBranchOverride ? (
        <View className="mb-3">
          <Text className="text-muted-foreground mb-1 text-xs font-medium">
            {translate('mobile.newWorkspace.branchNameLabel', 'Branch name')}
          </Text>
          <MobileGlassSurface className="min-h-11 overflow-hidden rounded-full" isInteractive>
            <TextInput
              className="text-foreground min-h-11 rounded-full px-4 text-sm"
              value={composer.branchNameOverride ?? ''}
              onChangeText={composer.handleBranchNameOverrideChange}
              placeholder={translate(
                'mobile.newWorkspace.branchNamePlaceholder',
                'Derived from name'
              )}
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MobileGlassSurface>
        </View>
      ) : null}

      {composer.reuseEligibleBranch ? (
        <View className="mb-3">
          <SettingsToggleRow
            label={translate('mobile.newWorkspace.reuseBranch.label', 'Reuse eligible branch')}
            onValueChange={composer.setReuseSelectedBranch}
            supportingText={translate(
              'mobile.newWorkspace.reuseBranch.branch',
              'Branch “{{branch}}”',
              { branch: composer.reuseEligibleBranch }
            )}
            supportingTextLines={1}
            value={composer.reuseSelectedBranch}
          />
        </View>
      ) : null}
    </>
  )
}
