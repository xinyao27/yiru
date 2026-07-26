import { Redirect, Stack, useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '../components/uniwind-icons'
import { SafeAreaView } from '../components/uniwind-native-components'
import { FLOATING_WORKSPACE_WORKTREE_ID } from '../session/floating-workspace'
import { updateSessionViewOverride } from '../storage/session-view-preferences'
import {
  mobileUiLabHostId,
  UI_LAB_SCENARIOS,
  UI_LAB_TERMINAL_TAB_ID,
  type MobileUiLabScenario
} from './fixtures'

export function MobileUiLabScreen(): React.JSX.Element {
  const router = useRouter()

  if (!__DEV__) {
    return <Redirect href="/" />
  }

  const leave = (): void => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/')
  }

  const openScenario = async (scenario: MobileUiLabScenario): Promise<void> => {
    const hostId = mobileUiLabHostId(scenario.id)
    if (scenario.surface === 'chat') {
      await updateSessionViewOverride(
        hostId,
        FLOATING_WORKSPACE_WORKTREE_ID,
        UI_LAB_TERMINAL_TAB_ID,
        'chat'
      )
    }
    router.push(
      `/h/${hostId}/session/${FLOATING_WORKSPACE_WORKTREE_ID}?name=${encodeURIComponent('UI Lab')}`
    )
  }

  return (
    <SafeAreaView className="bg-background flex-1" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="border-b-hairline border-border h-12 flex-row items-center gap-2 px-3">
        <Pressable
          accessibilityLabel="Close UI Lab"
          className="active:bg-accent h-9 w-9 items-center justify-center"
          onPress={leave}
        >
          <ChevronLeft size={20} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className="text-foreground flex-1 text-sm font-semibold">UI Lab</Text>
        <Text className="border-hairline border-border text-muted-foreground px-1.5 py-1 text-[10px] font-semibold">
          DEV ONLY
        </Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-safe-offset-6"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-foreground text-sm font-semibold">
          Production screens with mock data
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs leading-5">
          Each fixture opens the real mobile session route. Only its runtime responses are mocked.
        </Text>
        <View className="border-t-hairline border-border mt-4">
          {UI_LAB_SCENARIOS.map((scenario) => (
            <Pressable
              key={scenario.id}
              accessibilityRole="button"
              className="border-b-hairline border-border active:bg-accent min-h-16 flex-row items-center gap-3 py-3"
              onPress={() => void openScenario(scenario)}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-sm font-medium">{scenario.title}</Text>
                <Text className="text-muted-foreground mt-1 text-xs leading-4">
                  {scenario.description}
                </Text>
              </View>
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
