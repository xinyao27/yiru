import { Stack } from 'expo-router'
import { type ReactNode, useMemo } from 'react'
import { Platform, Text, View } from 'react-native'

import { MobileGlassHeader } from '../components/glass/header'
import { MobileGlassIconButton } from '../components/glass/icon-button'
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
  showReconnect: boolean
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
  showReconnect
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
        </Stack.Toolbar>
        <View className="px-3 py-2">{children}</View>
      </>
    )
  }

  return (
    <MobileGlassHeader includesTopInset>
      <View className="gap-2 px-3 pt-1 pb-2">
        <View className="min-h-10 flex-row items-center gap-2">
          <MobileGlassIconButton accessibilityLabel="Back to hosts" icon="back" onPress={onBack} />
          <View className="min-w-0 flex-1">
            <Text className="text-foreground flex-1 text-base font-semibold" numberOfLines={1}>
              {hostName || 'Host'}
            </Text>
          </View>
          <MobileWorkspaceListHeaderActions
            canUseHost={canUseHost}
            embedded={embedded}
            showReconnect={showReconnect}
            onAccounts={onAccounts}
            onHideSidebar={onHideSidebar}
            onReconnect={onReconnect}
          />
        </View>
        {children}
      </View>
    </MobileGlassHeader>
  )
}
