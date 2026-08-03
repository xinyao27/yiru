import { ScrollView, Text, View } from 'react-native'

import { MobileContentSection } from '~/components/content-section'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import { translate } from '~/i18n/translate'
import { useMobileDefaultSessionViewPreference } from '~/session/use-default-session-view-preference'

export default function NativeChatSettingsScreen(): React.JSX.Element {
  const { defaultView, setDefaultView } = useMobileDefaultSessionViewPreference()
  const chatDefault = defaultView === 'chat'

  return (
    <View className="bg-background flex-1 px-4 pt-4">
      <ScrollView contentContainerClassName="pb-safe-offset-4" showsVerticalScrollIndicator={false}>
        <Text className="text-muted-foreground mb-1 px-1 text-xs font-semibold tracking-wide">
          {translate('mobile.nativeChatSettings.defaultView.heading', 'DEFAULT VIEW')}
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          {translate(
            'mobile.nativeChatSettings.defaultView.description',
            'Choose how supported agent sessions open on this device. Terminal shows the raw CLI; Chat UI shows a chat interface like the desktop app. You can still switch any individual session from its long-press menu.'
          )}
        </Text>
        <MobileContentSection className="mt-2">
          <SettingsToggleRow
            label={translate(
              'mobile.nativeChatSettings.openInChat.label',
              'Open sessions in Chat UI'
            )}
            onValueChange={(next) => setDefaultView(next ? 'chat' : 'terminal')}
            value={chatDefault}
          />
        </MobileContentSection>
      </ScrollView>
    </View>
  )
}
