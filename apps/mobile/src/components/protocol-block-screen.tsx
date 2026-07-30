import type { MobileRuntimeCompatVerdict as CompatVerdict } from '@yiru/runtime-protocol/capabilities'
import { YIRU_ANDROID_LATEST_APK_URL, YIRU_IOS_TESTFLIGHT_URL } from '@yiru/workbench-model/product'
import { YIRU_GITHUB_RELEASES_URL } from '@yiru/workbench-model/product'
import { router } from 'expo-router'
import { Linking, Platform, Text, View } from 'react-native'

import { MobileContentSection } from './content-section'
import { MobileGlassGroup } from './glass/group'
import { MobileGlassTextButton } from './glass/text-button'

type Props = {
  verdict: Extract<CompatVerdict, { kind: 'blocked' }>
}

export function ProtocolBlockScreen({ verdict }: Props) {
  const isMobileTooOld = verdict.reason === 'mobile-too-old'
  const mobileUpdateTarget =
    Platform.OS === 'ios'
      ? { label: 'Open TestFlight', url: YIRU_IOS_TESTFLIGHT_URL }
      : { label: 'Download APK', url: YIRU_ANDROID_LATEST_APK_URL }
  const primaryAction = isMobileTooOld
    ? mobileUpdateTarget
    : { label: 'Open GitHub Releases', url: YIRU_GITHUB_RELEASES_URL }

  const title = isMobileTooOld ? 'Update Yiru Mobile' : 'Update Yiru on your computer'
  const body = isMobileTooOld
    ? 'This desktop needs a newer Yiru Mobile app. Install the latest mobile build, then try this host again.'
    : 'This paired desktop app is too old for your current Yiru Mobile app. Update Yiru on your computer, then try this host again.'
  const recoveryNote =
    'Already updated? Go back to Hosts and refresh the connection. If this message stays, remove this host and pair it again.'

  return (
    <View className="bg-background flex-1 justify-center px-4">
      <MobileContentSection className="rounded-3xl p-4">
        <Text className="text-foreground mb-2 text-sm font-bold">{title}</Text>
        <Text className="text-muted-foreground mb-4 text-sm leading-5">{body}</Text>
        {/* Why: mobile update channels differ by platform, while desktop
            updates continue to use the repository release page. */}
        <MobileGlassGroup className="gap-2" spacing={8}>
          <MobileGlassTextButton
            isFullWidth
            isProminent
            label={primaryAction.label}
            onPress={() => {
              void Linking.openURL(primaryAction.url)
            }}
            size="large"
          />
          <MobileGlassTextButton
            isFullWidth
            label="Back to hosts"
            onPress={() => {
              // Why: route back to the host list so the user can pair a
              // different host instead of getting trapped on this screen.
              router.replace('/')
            }}
            size="large"
          />
        </MobileGlassGroup>
        <Text className="text-muted-foreground mt-3 text-xs leading-5">{recoveryNote}</Text>
      </MobileContentSection>
    </View>
  )
}
