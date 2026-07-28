import { ScrollView, Switch, Text, View } from 'react-native'

import { MobileGlassSection } from '../src/components/glass/section'
import { useMobileDefaultSessionViewPreference } from '../src/session/use-default-session-view-preference'

export default function NativeChatSettingsScreen() {
  const { defaultView, setDefaultView } = useMobileDefaultSessionViewPreference()
  const chatDefault = defaultView === 'chat'

  return (
    <View className="bg-background flex-1 px-4 pt-4">
      <ScrollView contentContainerClassName="pb-safe-offset-4" showsVerticalScrollIndicator={false}>
        <Text className="text-muted-foreground mb-1 px-1 text-xs font-semibold tracking-wide">
          DEFAULT VIEW
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          Choose how supported agent sessions open on this device. Terminal shows the raw CLI; Chat
          UI shows a chat interface like the desktop app. You can still switch any individual
          session from its long-press menu.
        </Text>
        <MobileGlassSection className="mt-2">
          <View className="flex-row items-center gap-2.5 px-3.5 py-3">
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">Open sessions in Chat UI</Text>
              <Text className="text-muted-foreground mt-0.5 text-xs">
                {chatDefault ? 'On' : 'Off'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Open sessions in Chat UI"
              value={chatDefault}
              onValueChange={(next) => setDefaultView(next ? 'chat' : 'terminal')}
              trackColorOffClassName="accent-accent"
              trackColorOnClassName="accent-muted-foreground"
              thumbColorClassName="accent-foreground"
              ios_backgroundColorClassName="accent-accent"
            />
          </View>
        </MobileGlassSection>
      </ScrollView>
    </View>
  )
}
