import { Stack } from 'expo-router'
import { type ReactNode, useMemo } from 'react'
import { Platform, Text, View } from 'react-native'

import { MobileGlassIconButton } from '../components/glass/icon-button'
import { MobileGlassTextButton } from '../components/glass/text-button'
import { SafeAreaView } from '../components/uniwind-native-components'
import { MobileWorkspaceListHeaderActions } from './list-toolbar'

type MobileWorkspaceListChromeProps = {
  canUseHost: boolean
  children: ReactNode
  embedded: boolean
  hostName: string
  onAccounts: () => void
  onBack: () => void
  onHideSidebar?: () => void
  onReconnect: () => void
  onSearch: () => void
  showReconnect: boolean
  showSearch: boolean
}

export function MobileWorkspaceListChrome({
  canUseHost,
  children,
  embedded,
  hostName,
  onAccounts,
  onBack,
  onHideSidebar,
  onReconnect,
  onSearch,
  showReconnect,
  showSearch
}: MobileWorkspaceListChromeProps): React.JSX.Element {
  const nativeHeaderOptions = useMemo(
    () => ({
      headerBackVisible: false,
      headerShown: true,
      title: hostName || 'Host'
    }),
    [hostName]
  )

  if (!embedded && Platform.OS === 'ios') {
    return (
      <>
        <Stack.Screen options={nativeHeaderOptions} />
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel="Back to hosts"
            icon="chevron.left"
            onPress={onBack}
          />
        </Stack.Toolbar>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel="Reconnect"
            hidden={!showReconnect}
            icon="arrow.clockwise"
            onPress={onReconnect}
          />
          <Stack.Toolbar.Button
            accessibilityLabel="Accounts"
            disabled={!canUseHost}
            hidden={showReconnect}
            icon="person.crop.circle"
            onPress={onAccounts}
          />
          <Stack.Toolbar.Button
            accessibilityLabel={showSearch ? 'Close search' : 'Search workspaces'}
            icon={showSearch ? 'xmark' : 'magnifyingglass'}
            onPress={onSearch}
          />
        </Stack.Toolbar>
        <View className="px-3 py-2">{children}</View>
      </>
    )
  }

  return (
    <SafeAreaView className="bg-background" edges={['top']}>
      <View className="gap-2 px-3 pt-1 pb-2">
        <View className="min-h-10 flex-row items-center gap-2">
          <MobileGlassIconButton accessibilityLabel="Back to hosts" icon="back" onPress={onBack} />
          <View className="min-w-0 flex-1">
            <Text className="text-foreground flex-1 text-base font-semibold" numberOfLines={1}>
              {hostName || 'Host'}
            </Text>
          </View>
          {showReconnect ? <MobileGlassTextButton label="Reconnect" onPress={onReconnect} /> : null}
          {!embedded ? (
            <MobileWorkspaceListHeaderActions
              canUseHost={canUseHost}
              showSearch={showSearch}
              onAccounts={onAccounts}
              onSearch={onSearch}
            />
          ) : null}
          {embedded && onHideSidebar ? (
            <MobileGlassIconButton
              accessibilityLabel="Hide sidebar"
              icon="sidebar"
              onPress={onHideSidebar}
            />
          ) : null}
        </View>
        {children}
      </View>
    </SafeAreaView>
  )
}
