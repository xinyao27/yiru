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
    <View className={styles.container}>
      <View className={styles.card}>
        <Text className={styles.title}>{title}</Text>
        <Text className={styles.body}>{body}</Text>
        {/* Why: mobile update channels differ by platform, while desktop
            updates continue to use the repository release page. */}
        <Pressable
          className={cn(styles.primaryButton, styles.pressedActive)}
          onPress={() => {
            void Linking.openURL(primaryAction.url)
          }}
        >
          <Text className={styles.primaryButtonText}>{primaryAction.label}</Text>
        </Pressable>
        <Pressable
          className={cn(styles.secondaryButton, styles.pressedActive)}
          onPress={() => {
            // Why: route back to the host list so the user can pair a
            // different host instead of getting trapped on this screen.
            router.replace('/')
          }}
        >
          <Text className={styles.secondaryButtonText}>Back to hosts</Text>
        </Pressable>
        <Text className={styles.recoveryNote}>{recoveryNote}</Text>
      </View>
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background justify-center px-4'),
  card: cn('bg-card rounded-none p-4 border border-border'),
  title: cn('text-[18px] font-bold text-foreground mb-2'),
  body: cn('text-[14px] text-muted-foreground leading-[20px] mb-4'),
  primaryButton: cn('bg-foreground py-2.5 rounded-none items-center mb-2'),
  primaryButtonText: cn('text-[14px] font-semibold text-background'),
  secondaryButton: cn('bg-secondary py-2.5 rounded-none items-center'),
  secondaryButtonText: cn('text-[14px] font-semibold text-foreground'),
  recoveryNote: cn('text-[12px] text-muted-foreground/60 leading-[17px] mt-3'),
  pressed: cn('opacity-[0.7]'),
  pressedActive: cn('active:opacity-[0.7]')
} as const
