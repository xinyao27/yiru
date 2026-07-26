import type { MobileRuntimeCompatVerdict as CompatVerdict } from '@yiru/runtime-protocol/capabilities'
import { YIRU_ANDROID_LATEST_APK_URL, YIRU_IOS_TESTFLIGHT_URL } from '@yiru/workbench-model/product'
import { YIRU_GITHUB_RELEASES_URL } from '@yiru/workbench-model/product'
import { router } from 'expo-router'
import { Linking, Platform, Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

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
      <View className="border-border bg-card rounded-3xl border p-4">
        <Text className="text-foreground mb-2 text-sm font-bold">{title}</Text>
        <Text className="text-muted-foreground mb-4 text-sm leading-5">{body}</Text>
        {/* Why: mobile update channels differ by platform, while desktop
            updates continue to use the repository release page. */}
        <Pressable
          className={cn('mb-2 items-center rounded-2xl bg-primary py-2.5', styles.pressedActive)}
          onPress={() => {
            void Linking.openURL(primaryAction.url)
          }}
        >
          <Text className="text-primary-foreground text-sm font-semibold">
            {primaryAction.label}
          </Text>
        </Pressable>
        <Pressable
          className={cn('items-center rounded-2xl bg-secondary py-2.5', styles.pressedActive)}
          onPress={() => {
            // Why: route back to the host list so the user can pair a
            // different host instead of getting trapped on this screen.
            router.replace('/')
          }}
        >
          <Text className="text-foreground text-sm font-semibold">Back to hosts</Text>
        </Pressable>
        <Text className="text-muted-foreground mt-3 text-xs leading-5">{recoveryNote}</Text>
      </View>
    </View>
  )
}

const styles = {
  pressedActive: cn('active:bg-accent')
} as const
