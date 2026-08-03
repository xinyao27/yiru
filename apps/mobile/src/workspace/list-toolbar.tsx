import { View } from 'react-native'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { MobileGlassTextButton } from '../components/glass/text-button'
import { MobileSearchField } from '../components/search-field'
import { translate } from '../i18n/translate'

type MobileWorkspaceListToolbarProps = {
  canUseHost: boolean
  embedded: boolean
  floatingWorkspaceEnabled: boolean
  search: string
  onAccounts: () => void
  onFloatingWorkspace: () => void
  onNewWorkspace: () => void
  onSearchChange: (value: string) => void
}

type MobileWorkspaceListHeaderActionsProps = {
  canUseHost: boolean
  embedded: boolean
  onHideSidebar?: () => void
  onReconnect: () => void
  showReconnect: boolean
  onAccounts: () => void
}

export function MobileWorkspaceListHeaderActions({
  canUseHost,
  embedded,
  onHideSidebar,
  onReconnect,
  showReconnect,
  onAccounts
}: MobileWorkspaceListHeaderActionsProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      {showReconnect ? (
        <MobileGlassTextButton
          label={translate('mobile.workspace.actions.reconnect', 'Reconnect')}
          onPress={onReconnect}
        />
      ) : null}
      {!embedded && !showReconnect ? (
        <MobileGlassIconButton
          accessibilityLabel={translate('mobile.workspace.actions.accounts', 'Accounts')}
          disabled={!canUseHost}
          icon="account"
          onPress={onAccounts}
        />
      ) : null}
      {embedded && onHideSidebar ? (
        <MobileGlassIconButton
          accessibilityLabel={translate('mobile.workspace.actions.hideSidebar', 'Hide sidebar')}
          icon="sidebar"
          onPress={onHideSidebar}
        />
      ) : null}
    </MobileGlassGroup>
  )
}

export function MobileWorkspaceListToolbar({
  canUseHost,
  embedded,
  floatingWorkspaceEnabled,
  search,
  onAccounts,
  onFloatingWorkspace,
  onNewWorkspace,
  onSearchChange
}: MobileWorkspaceListToolbarProps): React.JSX.Element {
  const primaryControls = (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      {embedded && floatingWorkspaceEnabled ? (
        <MobileGlassIconButton
          accessibilityLabel={translate(
            'mobile.workspace.actions.floatingWorkspace',
            'Floating Workspace'
          )}
          disabled={!canUseHost}
          icon="terminal"
          onPress={onFloatingWorkspace}
          size="large"
        />
      ) : null}
      <View className="flex-1">
        <MobileSearchField
          value={search}
          onChangeText={onSearchChange}
          placeholder={translate('mobile.workspace.search.placeholder', 'Search workspaces…')}
          accessibilityLabel={translate('mobile.workspace.search.label', 'Search workspaces')}
        />
      </View>
      {!embedded && floatingWorkspaceEnabled ? (
        <MobileGlassIconButton
          accessibilityLabel={translate(
            'mobile.workspace.actions.floatingWorkspace',
            'Floating Workspace'
          )}
          disabled={!canUseHost}
          icon="terminal"
          onPress={onFloatingWorkspace}
          size="large"
        />
      ) : null}
    </MobileGlassGroup>
  )

  if (!embedded) {
    return primaryControls
  }

  return (
    <View className="gap-2">
      {primaryControls}
      <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
        <MobileGlassIconButton
          accessibilityLabel={translate('mobile.workspace.actions.accounts', 'Accounts')}
          disabled={!canUseHost}
          icon="account"
          onPress={onAccounts}
        />
        <MobileGlassIconButton
          accessibilityLabel={translate('mobile.workspace.actions.newWorkspace', 'New workspace')}
          disabled={!canUseHost}
          icon="plus"
          onPress={onNewWorkspace}
        />
      </MobileGlassGroup>
    </View>
  )
}
