import { Stack } from 'expo-router'
import { useMemo } from 'react'
import { Platform, Text, View } from 'react-native'

import { MobileGlassHeader } from '~/components/glass/header'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { translate } from '~/i18n/translate'

import { MobileWorkspaceListHeaderActions } from './list-actions'

type MobileWorkspaceListChromeProps = {
  canUseHost: boolean
  embedded: boolean
  floatingWorkspaceEnabled: boolean
  hostName: string
  onAccounts: () => void
  onBack: () => void
  onFloatingWorkspace: () => void
  onHideSidebar?: () => void
  onNewWorkspace: () => void
  onOpenSearch: () => void
  onReconnect: () => void
  showReconnect: boolean
}

export function MobileWorkspaceListChrome({
  canUseHost,
  embedded,
  floatingWorkspaceEnabled,
  hostName,
  onAccounts,
  onBack,
  onFloatingWorkspace,
  onHideSidebar,
  onNewWorkspace,
  onOpenSearch,
  onReconnect,
  showReconnect
}: MobileWorkspaceListChromeProps): React.JSX.Element {
  const nativeHeaderOptions = useMemo(
    () => ({
      headerBackVisible: false,
      headerShown: true,
      title: hostName || translate('mobile.host.title', 'Host')
    }),
    [hostName]
  )

  if (!embedded && Platform.OS === 'ios') {
    return (
      <>
        <Stack.Screen options={nativeHeaderOptions} />
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel={translate('mobile.workspace.actions.backToHosts', 'Back to hosts')}
            icon="chevron.left"
            onPress={onBack}
          />
        </Stack.Toolbar>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel={translate('mobile.workspace.actions.search', 'Search workspaces')}
            icon="magnifyingglass"
            onPress={onOpenSearch}
          />
          <Stack.Toolbar.Menu
            accessibilityLabel={translate('mobile.workspace.actions.more', 'More actions')}
            icon="ellipsis.circle"
            title={translate('mobile.workspace.actions.menuTitle', 'Workspace actions')}
          >
            <Stack.Toolbar.MenuAction disabled={!canUseHost} icon="plus" onPress={onNewWorkspace}>
              {translate('mobile.workspace.actions.newWorkspace', 'New workspace')}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              disabled={!canUseHost}
              hidden={!floatingWorkspaceEnabled}
              icon="terminal"
              onPress={onFloatingWorkspace}
            >
              {translate('mobile.workspace.actions.floatingWorkspace', 'Floating Workspace')}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              disabled={!canUseHost}
              icon="person.crop.circle"
              onPress={onAccounts}
            >
              {translate('mobile.workspace.actions.accounts', 'Accounts')}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              hidden={!showReconnect}
              icon="arrow.clockwise"
              onPress={onReconnect}
            >
              {translate('mobile.workspace.actions.reconnect', 'Reconnect')}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      </>
    )
  }

  return (
    <MobileGlassHeader includesTopInset>
      <View className="px-3 pt-1 pb-2">
        <View className="min-h-10 flex-row items-center gap-2">
          <MobileGlassIconButton
            accessibilityLabel={translate('mobile.workspace.actions.backToHosts', 'Back to hosts')}
            icon="back"
            onPress={onBack}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-foreground flex-1 text-base font-semibold" numberOfLines={1}>
              {hostName || translate('mobile.host.title', 'Host')}
            </Text>
          </View>
          <MobileWorkspaceListHeaderActions
            canUseHost={canUseHost}
            onAccounts={onAccounts}
            onFloatingWorkspace={onFloatingWorkspace}
            onNewWorkspace={onNewWorkspace}
            onOpenSearch={onOpenSearch}
            onReconnect={onReconnect}
            onHideSidebar={onHideSidebar}
            floatingWorkspaceEnabled={floatingWorkspaceEnabled}
            showReconnect={showReconnect}
          />
        </View>
      </View>
    </MobileGlassHeader>
  )
}
